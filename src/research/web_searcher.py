"""
Web Research Agent til juridisk research med kildecitation
Søger i relevante kilder og citerer præcist
"""

import asyncio
import aiohttp
import json
import os
from typing import Dict, List, Any, Optional, Tuple, Callable
from datetime import datetime, timedelta
from urllib.parse import urlencode, quote_plus, urlsplit, urlunsplit, parse_qs, parse_qsl
import re
from dataclasses import dataclass
import logging
import html

logger = logging.getLogger(__name__)


RESEARCH_FOCUS_AREAS = {
    "EU AI Act", "GDPR", "Dansk lovgivning", "Automatiserede beslutninger",
    "Højrisiko AI systemer", "Biometrisk identifikation", "Databeskyttelse",
    "Datatilsynets vejledninger",
}


def validate_focus_areas(values: Optional[List[str]]) -> List[str]:
    selected = values or ["EU AI Act", "GDPR", "Dansk lovgivning"]
    normalized = ["Dansk lovgivning" if value == "dansk lovgivning" else value for value in selected]
    if len(normalized) > 8 or any(value not in RESEARCH_FOCUS_AREAS for value in normalized):
        raise ValueError("Vælg et af de angivne fokusområder til research.")
    return list(dict.fromkeys(normalized))


@dataclass
class Source:
    """Datakilde med metadata"""
    title: str
    url: str
    content: str
    domain: str
    date_accessed: datetime
    date_published: Optional[datetime] = None
    source_type: str = "website"  # website, pdf, regulation, guideline
    authority: Optional[str] = None  # f.eks. "EU Commission", "Datatilsynet"
    relevance_score: float = 0.0


@dataclass
class Citation:
    """Citation med præcis kildeangivelse"""
    text: str
    source: Source
    page_number: Optional[int] = None
    section: Optional[str] = None
    confidence: float = 1.0


class WebSearcher:
    """
    Avanceret web searcher til juridisk research
    Fokuserer på autoritative kilder
    """

    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        from src.services.codex_text_provider import is_available
        self.use_codex = is_available()
        self.sources_cache: Dict[str, Source] = {}

        # Brug Azure OpenAI hvis tilgængelig, ellers standard OpenAI
        self.azure_endpoint = os.getenv('AZURE_OPENAI_ENDPOINT')
        self.azure_api_key = os.getenv('AZURE_OPENAI_API_KEY')
        self.azure_deployment = os.getenv('AZURE_DEPLOYMENT_NAME', 'gpt-4o-mini')
        self.azure_api_version = os.getenv('OPENAI_API_VERSION', '2024-02-15-preview')

        self.openai_api_key = os.getenv('OPENAI_API_KEY')
        self.openai_model = os.getenv('OPENAI_MODEL', 'gpt-4o-mini')
        self.google_api_key = os.getenv('GOOGLE_API_KEY')
        self.google_cse_id = os.getenv('GOOGLE_CSE_ID')  # Specific sites CSE
        self.google_cse_general_id = os.getenv('GOOGLE_CSE_GENERAL_ID')  # General web search CSE

        # Prioriter Azure OpenAI
        self.use_azure = bool(self.azure_endpoint and self.azure_api_key)

        # Autoritative domæner for juridisk information
        base_trusted = {
            'eur-lex.europa.eu': {'authority': 'EU-Kommissionen', 'type': 'regulation'},
            'datatilsynet.dk': {'authority': 'Datatilsynet', 'type': 'national_authority'},
            'retsinformation.dk': {'authority': 'Retsinformation', 'type': 'danish_law'},
            'europa.eu': {'authority': 'EU', 'type': 'official'},
            'edpb.europa.eu': {'authority': 'EDPB', 'type': 'guideline'},
            'commission.europa.eu': {'authority': 'EU-Kommissionen', 'type': 'official'},
            'consilium.europa.eu': {'authority': 'EU-Rådet', 'type': 'official'},
            'europarl.europa.eu': {'authority': 'EU-Parlamentet', 'type': 'official'},
            'kl.dk': {'authority': 'KL', 'type': 'municipal_association'}
        }

        # Tilføj www.-varianter for metadata, men tillad ellers alle domæner
        self.trusted_domains = base_trusted.copy()
        for domain, meta in base_trusted.items():
            if not domain.startswith('www.'):
                self.trusted_domains[f"www.{domain}"] = meta

        self.allowed_llm_domains = None  # ingen whitelist – hent alle kilder

    async def __aenter__(self):
        import ssl
        import certifi

        # Create SSL context that accepts self-signed certificates for development
        ssl_context = ssl.create_default_context(cafile=certifi.where())
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE

        connector = aiohttp.TCPConnector(ssl=ssl_context)

        self.session = aiohttp.ClientSession(
            connector=connector,
            timeout=aiohttp.ClientTimeout(total=30),
            headers={
                'User-Agent': 'The-Judge-AI-Compliance-Bot/1.0 (Research Purpose)'
            }
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    async def research_topic(
        self,
        query: str,
        focus_areas: List[str] = None,
        progress_callback: Optional[Callable] = None
    ) -> Dict[str, Any]:
        """
        Udfører omfattende research på et juridisk emne

        Args:
            query: Søgeforespørgsel
            focus_areas: Specifikke områder at fokusere på
            progress_callback: Optional callback for progress updates

        Returns:
            Dict med research resultater og citationer
        """
        logger.info(f"Starter juridisk research: {query}")

        if progress_callback:
            await progress_callback("Starter juridisk research...", "initializing", 0)

        focus_areas = validate_focus_areas(focus_areas)

        results: Dict[str, Any] = {
            "query": query,
            "focus_areas": focus_areas,
            "sources": [],
            "citations": [],
            "summary": "",
            "key_findings": [],
            "recommendations": [],
            "last_updated": datetime.now().isoformat()
        }

        # Søg i forskellige autoritative kilder
        if progress_callback:
            await progress_callback("Søger i EUR-Lex, Datatilsynet, EDPB...", "searching", 10)

        search_tasks = [
            self._search_eur_lex(query, focus_areas=focus_areas),
            self._search_datatilsynet(query),
            self._search_retsinformation(query),
            self._search_eu_official(query),
            self._search_edpb_guidelines(query),
            self._search_google(query, focus_areas=focus_areas),
            self._search_duckduckgo(query, focus_areas=focus_areas)
        ]

        if not self.use_codex and self.openai_api_key:
            search_tasks.append(self._llm_discover_sources(query, focus_areas))

        if progress_callback:
            await progress_callback(f"Kører {len(search_tasks)} parallelle søgninger...", "searching", 20)

        # Kør søgninger parallelt
        search_results = await asyncio.gather(*search_tasks, return_exceptions=True)

        if progress_callback:
            await progress_callback("Behandler søgeresultater...", "processing", 40)

        # Behandl resultater
        all_sources = []
        for result in search_results:
            if isinstance(result, list):
                all_sources.extend(result)
            elif isinstance(result, Exception):
                logger.warning(f"Søgning fejlede: {result}")

        if len(all_sources) < 3 and not self.use_codex and self.openai_api_key:
            try:
                llm_sources = await self._llm_discover_sources(query, focus_areas)
                all_sources.extend(llm_sources)
            except Exception as exc:
                logger.warning("Ekstra LLM søgning mislykkedes: %s", exc)

        if len(all_sources) < 3:
            extra_sources = await self._search_duckduckgo(query, limit=12, focus_areas=focus_areas)
            all_sources.extend(extra_sources)

        all_sources = self._deduplicate_sources(all_sources)
        # An unavailable page or an authority's homepage is not evidence.
        # Keep only fetched text; do not pad a thin result with invented sources.
        all_sources = [source for source in all_sources if source.content.strip()]
        results["warnings"] = []
        if len(all_sources) < 3:
            results["warnings"].append(
                "Der blev fundet færre end tre kilder med læsbart indhold. Søgeresultatet kan være ufuldstændigt."
            )
        results["status"] = "sources_found" if all_sources else "no_sources"

        if progress_callback:
            await progress_callback(f"Fundet {len(all_sources)} kilder - sorterer efter relevans...", "processing", 50)

        # Sorter efter relevans
        all_sources.sort(key=lambda x: x.relevance_score, reverse=True)

        # Tag de bedste kilder
        top_sources = all_sources[:10]
        results["sources"] = [self._source_to_dict(s) for s in top_sources]
        if not top_sources:
            results["summary"] = "Der blev ikke fundet læsbare kilder til spørgsmålet. Prøv et mere præcist emne."
            results["llm_provider"] = None
            return results

        if progress_callback:
            await progress_callback(f"Genererer citationer fra {len(top_sources)} top kilder...", "analyzing", 60)

        # Generer citationer
        citations = await self._generate_citations(query, top_sources)
        results["citations"] = [self._citation_to_dict(c) for c in citations]

        # Generer sammenfatning og LLM svar
        if self.use_codex or self.use_azure or self.openai_api_key:
            if progress_callback:
                await progress_callback("Analyserer med AI LLM...", "analyzing", 70)

            llm_answer = await self._generate_llm_answer(query, top_sources)
            if llm_answer:
                results["llm_answer"] = llm_answer.get("answer")
                results["llm_answer_key_points"] = llm_answer.get("key_points", [])
                results["llm_answer_citations"] = llm_answer.get("citations", [])
                results["llm_answer_confidence"] = llm_answer.get("confidence", 0.8)
                if self.use_codex:
                    from src.services.codex_text_provider import MODEL, PROVIDER
                    results["llm_provider"], results["model"] = PROVIDER, MODEL
                else:
                    results["llm_provider"] = "azure" if self.use_azure else "openai"
                    results["model"] = self.azure_deployment if self.use_azure else self.openai_model

            if self.use_codex:
                # One explicitly selected model produces all generated fields.
                # Never fall through to cloud helpers when local opt-in is active.
                results["cross_references"] = []
                results["key_findings"] = llm_answer.get("key_points", []) if llm_answer else []
                results["recommendations"] = llm_answer.get("recommendations", []) if llm_answer else []
            else:
                if progress_callback:
                    await progress_callback("Genererer krydsreferencer...", "analyzing", 80)
                results["cross_references"] = await self._generate_cross_references(query, top_sources)

                if progress_callback:
                    await progress_callback("Udtrækker key findings...", "analyzing", 85)
                results["key_findings"] = await self._extract_key_findings_with_llm(query, top_sources)

                if progress_callback:
                    await progress_callback("Genererer anbefalinger...", "analyzing", 90)
                results["recommendations"] = await self._generate_recommendations_with_llm(query, top_sources)
        else:
            results["key_findings"] = await self._extract_key_findings(top_sources)
            results["recommendations"] = await self._generate_recommendations(query, citations)

        if progress_callback:
            await progress_callback("Genererer sammenfatning...", "finalizing", 95)

        results["summary"] = await self._generate_summary(query, top_sources, citations)
        results.setdefault("llm_provider", None)

        if progress_callback:
            await progress_callback(f"Research afsluttet! {len(top_sources)} kilder, {len(citations)} citationer", "complete", 100)

        logger.info(f"Research afsluttet: {len(top_sources)} kilder, {len(citations)} citationer")
        return results

    async def _llm_discover_sources(self, query: str, focus_areas: List[str]) -> List[Source]:
        """Brug OpenAI LLM til at foreslå relevante autoritative kilder."""
        if self.use_codex or not self.openai_api_key or not self.session:
            return []

        system_prompt = (
            "Du er en juridisk researcher specialist i AI-compliance og EU lovgivning. "
            "Returner ONLY valid JSON med 'urls' nøgle som array af strings. "
            "Hver URL skal være en reel, eksisterende kilde fra autoritative domæner som "
            "eur-lex.europa.eu, datatilsynet.dk, edpb.europa.eu, kl.dk, retsinformation.dk. "
            "Find 3-5 specifikke, relevante dokumenter."
        )

        user_prompt = (
            f"Emne: {query}\n"
            f"Fokusområder: {', '.join(focus_areas)}\n\n"
            "Find de mest relevante officielle kilder. Returner JSON format:\n"
            '{"urls": ["https://...", "https://..."]}'
        )

        payload = {
            "model": self.openai_model,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.2,
            "max_tokens": 512,
        }

        try:
            async with self.session.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.openai_api_key}",
                    "Content-Type": "application/json"
                },
                json=payload
            ) as response:
                if response.status != 200:
                    text = await response.text()
                    logger.warning("OpenAI forespørgsel fejlede: %s - %s", response.status, text)
                    return []
                data = await response.json()
        except Exception as exc:
            logger.warning("OpenAI forespørgsel mislykkedes: %s", exc)
            return []

        try:
            content = data["choices"][0]["message"]["content"]
            llm_payload = json.loads(content)
            urls = llm_payload.get("urls", [])
        except (KeyError, json.JSONDecodeError, IndexError) as exc:
            logger.warning("Kunne ikke tolke OpenAI svar: %s", exc)
            return []

        sources: List[Source] = []
        for url in urls:
            if not isinstance(url, str):
                continue
            domain = self._extract_domain(url)
            source = await self._fetch_source(url, authority=self.trusted_domains.get(domain, {}).get('authority'))
            if source and self._is_relevant(source.content, query):
                source.relevance_score = max(source.relevance_score, 0.85)
                sources.append(source)

        logger.info("OpenAI foreslog %d kilder", len(sources))
        return sources

    async def _generate_cross_references(self, query: str, sources: List[Source]) -> List[Dict[str, Any]]:
        """Brug OpenAI til at skabe krydsreferencer mellem kilder."""
        if self.use_codex or not self.openai_api_key or not sources:
            return []

        docs = []
        for idx, source in enumerate(sources[:5], start=1):
            docs.append({
                "index": idx,
                "title": source.title,
                "authority": source.authority or source.domain,
                "url": source.url,
                "snippet": source.content[:600]
            })

        system_prompt = (
            "Du er en juridisk analytiker. Udarbejd 3-5 korte faktabokse om AI-compliance baseret på de leverede kilder. "
            "Hver faktaboks skal indeholde en dansk sætning og referencer til mindst én kilde. Returner JSON med nøglen 'items', "
            "hvor hvert element har 'statement' og 'citations' (liste af kildeindeks)."
        )

        user_prompt = (
            f"Emne: {query}\n"
            "Kilder:\n" + json.dumps(docs, ensure_ascii=False)
        )

        payload = {
            "model": self.openai_model,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.2,
            "max_tokens": 1024,
        }

        try:
            async with self.session.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.openai_api_key}",
                    "Content-Type": "application/json"
                },
                json=payload
            ) as response:
                if response.status != 200:
                    text = await response.text()
                    logger.warning("OpenAI krydsreference fejlede: %s - %s", response.status, text)
                    return []
                data = await response.json()
        except Exception as exc:
            logger.warning("OpenAI krydsreference forespørgsel mislykkedes: %s", exc)
            return []

        try:
            content = data["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            items = parsed.get("items", [])
        except (KeyError, json.JSONDecodeError, IndexError) as exc:
            logger.warning("Kunne ikke tolke OpenAI krydsreference svar: %s", exc)
            return []

        cross_refs: List[Dict[str, Any]] = []
        for item in items:
            statement = item.get("statement")
            citations_idx = item.get("citations", [])
            if not statement or not isinstance(citations_idx, list):
                continue
            citations = []
            for idx in citations_idx:
                try:
                    src = sources[idx - 1]
                except (IndexError, TypeError):
                    continue
                citations.append({
                    "title": src.title,
                    "authority": src.authority or src.domain,
                    "url": src.url
                })
            if citations:
                cross_refs.append({
                    "statement": statement,
                    "citations": citations
                })

        return cross_refs

    async def _generate_llm_answer(self, query: str, sources: List[Source]) -> Optional[Dict[str, Any]]:
        """Generer et detaljeret Perplexity-stil svar med citationer og confidence scores."""
        if (not self.use_codex and not self.use_azure and not self.openai_api_key) or not sources:
            return None

        docs = []
        for idx, source in enumerate(sources[:10], start=1):
            docs.append({
                "index": idx,
                "title": source.title,
                "authority": source.authority or source.domain,
                "url": source.url,
                "relevance_score": source.relevance_score,
                "snippet": source.content[:2000]
            })

        system_prompt = (
            "Du er en juridisk AI-compliance ekspert. Besvar spørgsmålet detaljeret og præcist på dansk (3-5 afsnit). "
            "Skriv som Perplexity.ai: Start med en direkte besvarelse, derefter uddyb med detaljer og kontekst. "
            "Returner JSON med følgende struktur:\n"
            "{\n"
            "  \"answer\": \"Detaljeret svar med [nummer] inline citationer efter hver påstand\",\n"
            "  \"confidence\": 0.0-1.0,\n"
            "  \"key_points\": [\"Hovedpunkt 1\", \"Hovedpunkt 2\", ...],\n"
            "  \"citations\": [{\"source_index\": int, \"quote\": string, \"relevance\": string}, ...]\n"
            "}\n\n"
            "Tilføj også 'recommendations': en liste af konkrete anbefalinger, tydeligt adskilt fra vurderinger.\n"
            "VIGTIGT:\n"
            "- Brug ALTID de leverede kilder - citér kun verificerede fakta\n"
            "- Tilføj [nummer] efter hver sætning der refererer til en kilde\n"
            "- Skriv naturligt og sammenhængende på dansk\n"
            "- Inkluder alle relevante detaljer fra kilderne\n"
            "- Strukturer svaret i logiske afsnit (brug \\n\\n mellem afsnit)"
        )

        user_prompt = (
            f"Spørgsmål: {query}\n\n"
            "Kilder:\n" + json.dumps(docs, ensure_ascii=False, indent=2) + "\n\n"
            "Generer et omfattende, velstruktureret svar baseret på kilderne."
        )

        payload = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.2,
            "max_tokens": 2500,
            "response_format": {"type": "json_object"}
        }

        # Tilføj model kun for standard OpenAI
        if not self.use_azure:
            payload["model"] = self.openai_model

        # Vælg endpoint og headers baseret på Azure eller standard OpenAI
        if self.use_azure:
            url = f"{self.azure_endpoint}/openai/deployments/{self.azure_deployment}/chat/completions?api-version={self.azure_api_version}"
            headers = {
                "api-key": self.azure_api_key,
                "Content-Type": "application/json"
            }
        else:
            url = "https://api.openai.com/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {self.openai_api_key}",
                "Content-Type": "application/json"
            }

        try:
            if self.use_codex:
                from src.services.codex_text_provider import generate_text
                content = await asyncio.to_thread(generate_text, system_prompt, user_prompt, max_tokens=2500)
                data = {"choices": [{"message": {"content": content}}]}
            else:
                async with self.session.post(url, headers=headers, json=payload) as response:
                    if response.status != 200:
                        logger.warning("Modelbesvarelsen fejlede med HTTP %s", response.status)
                        return None
                    data = await response.json()
        except Exception:
            logger.warning("Modelbesvarelsen kunne ikke gennemføres")
            return None

        try:
            content = data["choices"][0]["message"]["content"]
            content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip())
            parsed = json.loads(content)
            if not isinstance(parsed, dict):
                return None
            answer = parsed.get("answer", "")
            if not isinstance(answer, str) or not answer.strip():
                return None
            overall_confidence = parsed.get("confidence", 0.8)
            key_points_raw = parsed.get("key_points", [])
            key_points = [item.strip() for item in key_points_raw if isinstance(item, str) and item.strip()] if isinstance(key_points_raw, list) else []
            recommendations_raw = parsed.get("recommendations", [])
            recommendations = [item.strip() for item in recommendations_raw if isinstance(item, str) and item.strip()] if isinstance(recommendations_raw, list) else []
            citations_map = parsed.get("citations", [])
            if not isinstance(citations_map, list):
                citations_map = []
        except (KeyError, json.JSONDecodeError, IndexError, TypeError, AttributeError) as exc:
            logger.warning("Kunne ikke tolke OpenAI svar JSON: %s", exc)
            return None

        citation_details = []
        for entry in citations_map:
            if not isinstance(entry, dict):
                continue
            citation_index = entry.get("source_index")
            if type(citation_index) is not int or not 1 <= citation_index <= len(sources):
                continue
            try:
                source = sources[citation_index - 1]
                quote_text = str(entry.get("quote") or "").strip()
                if not quote_text or " ".join(quote_text.split()) not in " ".join(source.content.split()):
                    continue
                citation_details.append({
                    "snippet": entry.get("quote", ""),
                    "title": source.title,
                    "authority": source.authority or source.domain,
                    "url": source.url,
                    "relevance": entry.get("relevance", "supporting"),
                    "confidence": source.relevance_score
                })
            except (IndexError, TypeError):
                continue

        return {
            "answer": answer,
            "key_points": key_points,
            "recommendations": recommendations,
            "citations": citation_details,
            "confidence": overall_confidence
        }

    async def _search_eur_lex(self, query: str, focus_areas: Optional[List[str]] = None) -> List[Source]:
        """Fetch named regulations selected by topic and explicit focus."""
        normalized = query.lower()
        focus = set(focus_areas or [])
        document_queries = []
        if (not focus or focus & {"GDPR", "Databeskyttelse", "Datatilsynets vejledninger", "Automatiserede beslutninger"}) and ("GDPR" in focus or any(term in normalized for term in ("gdpr", "databeskytt", "personoplys", "konsekvensanalyse", "dpia"))):
            document_queries.append("GDPR 2016/679")
        if (not focus or focus & {"EU AI Act", "Højrisiko AI systemer", "Biometrisk identifikation"}) and ("EU AI Act" in focus or any(term in normalized for term in ("ai act", "ai-forordning", "kunstig intelligens", "højrisiko", "2024/1689"))):
            document_queries.append("AI Act 2024/1689")
        sources = []
        for document_query in document_queries:
            source = await self._fetch_eur_lex_document(document_query)
            if source:
                sources.append(source)
        return sources

    async def _search_datatilsynet(self, query: str) -> List[Source]:
        """Søger på Datatilsynets hjemmeside"""
        sources = []
        try:
            # Datatilsynet AI vejledninger
            datatilsynet_urls = [
                "https://www.datatilsynet.dk/media/dokumenter/vejledning-til-gdpr/kunstig-intelligens-og-databeskyttelse.pdf",
                "https://www.datatilsynet.dk/hvad-siger-reglerne/vejledning/ai-og-gdpr/",
                "https://www.datatilsynet.dk/hvad-siger-reglerne/vejledning/automatiserede-afgørelser/"
            ]

            for url in datatilsynet_urls:
                source = await self._fetch_source(url, authority="Datatilsynet")
                if source and self._is_relevant(source.content, query):
                    sources.append(source)

        except Exception as e:
            logger.error(f"Datatilsynet søgning fejlede: {e}")

        return sources

    async def _search_retsinformation(self, query: str) -> List[Source]:
        """Søger i Retsinformation"""
        sources = []
        try:
            # Dansk implementering af GDPR og AI relateret lovgivning
            laws = [
                "https://www.retsinformation.dk/eli/lta/2018/502",  # Databeskyttelsesloven
                "https://www.retsinformation.dk/eli/ft/201913L00096",  # Lov om ændring af databeskyttelsesloven
            ]

            for url in laws:
                source = await self._fetch_source(url, authority="Retsinformation")
                if source:
                    sources.append(source)

        except Exception as e:
            logger.error(f"Retsinformation søgning fejlede: {e}")

        return sources

    async def _search_eu_official(self, query: str) -> List[Source]:
        """Søger på officielle EU sider"""
        sources = []
        try:
            # EU officielle dokumenter om AI
            official_docs = [
                "https://commission.europa.eu/strategy-and-policy/priorities-2019-2024/europe-fit-digital-age/european-approach-artificial-intelligence_en",
                "https://ec.europa.eu/info/strategy/priorities-2019-2024/europe-fit-digital-age/european-approach-artificial-intelligence/proposal-regulation-european-approach-artificial-intelligence_en",
                "https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-ai-system-definition-facilitate-first-ai-acts-rules-application"
            ]

            for url in official_docs:
                source = await self._fetch_source(url, authority="EU-Kommissionen")
                if source and self._is_relevant(source.content, query):
                    sources.append(source)

        except Exception as e:
            logger.error(f"EU officiel søgning fejlede: {e}")

        return sources

    async def _search_edpb_guidelines(self, query: str) -> List[Source]:
        """Søger i EDPB guidelines"""
        sources = []
        try:
            # EDPB guidelines om AI og automated decision-making
            guidelines = [
                "https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-42021-automated-individual-decision-making_en",
                "https://edpb.europa.eu/our-work-tools/our-documents/opinion/opinion-262021-draft-commission-implementing-decision_en"
            ]

            for url in guidelines:
                source = await self._fetch_source(url, authority="EDPB")
                if source and self._is_relevant(source.content, query):
                    sources.append(source)

        except Exception as e:
            logger.error(f"EDPB søgning fejlede: {e}")

        return sources

    async def _search_duckduckgo(self, query: str, limit: int = 8, focus_areas: Optional[List[str]] = None) -> List[Source]:
        """Generisk søgning på nettet via DuckDuckGo."""
        sources: List[Source] = []
        if not self.session:
            return sources

        queries = [f"{query} artificial intelligence compliance"]
        if focus_areas:
            for area in focus_areas:
                queries.append(f"{query} {area}")

        seen_urls = set()
        pattern = re.compile(r'<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', re.IGNORECASE)

        for q in queries:
            params = urlencode({"q": q, "kl": "da-da"})
            url = f"https://duckduckgo.com/html/?{params}"

            try:
                async with self.session.get(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; JudgeAI/1.0)'}) as response:
                    if response.status != 200:
                        logger.warning("DuckDuckGo søgning fejlede: %s", response.status)
                        continue
                    html_text = await response.text()
            except Exception as exc:
                logger.warning("DuckDuckGo forespørgsel mislykkedes: %s", exc)
                continue

            for match in pattern.finditer(html_text):
                href, title_html = match.groups()
                href = html.unescape(href)
                if href.startswith("//"):
                    href = "https:" + href
                parsed = urlsplit(href)
                if parsed.hostname and parsed.hostname.endswith("duckduckgo.com"):
                    href = parse_qs(parsed.query).get("uddg", [href])[0]
                if urlsplit(href).scheme not in {"http", "https"}:
                    continue
                title = re.sub('<[^<]+?>', '', html.unescape(title_html)).strip()
                if href in seen_urls:
                    continue
                seen_urls.add(href)
                source = await self._fetch_source(href)
                if source is None or not source.content.strip():
                    continue
                source.title = title or source.title
                source.relevance_score = max(
                    source.relevance_score,
                    0.6 if self._is_relevant(source.content, query) else 0.3,
                )
                sources.append(source)
                if len(sources) >= limit:
                    break
            if len(sources) >= limit:
                break

        logger.info("DuckDuckGo fandt %d kilder", len(sources))
        return sources

    async def _search_google(self, query: str, limit: int = 10, focus_areas: Optional[List[str]] = None) -> List[Source]:
        """Søg med Google Custom Search API for bedre, up-to-date resultater.

        Bruger to CSEs parallelt:
        1. Specifik CSE (google_cse_id) - søger i udvalgte autoritative sider
        2. General CSE (google_cse_general_id) - åben web søgning
        """
        sources: List[Source] = []

        if not self.google_api_key or not self.session:
            logger.info("Google Custom Search ikke konfigureret - springer over")
            return sources

        if not self.google_cse_id and not self.google_cse_general_id:
            logger.info("Ingen Google CSE IDs konfigureret - springer over")
            return sources

        # Byg søgestreng med fokusområder
        search_query = f"{query} AI compliance"
        if focus_areas:
            search_query += " " + " ".join(focus_areas)

        seen_urls = set()
        search_tasks = []

        # Helper function til at søge i en CSE
        async def search_cse(cse_id: str, search_query: str, cse_name: str):
            cse_sources = []
            try:
                params = {
                    'key': self.google_api_key,
                    'cx': cse_id,
                    'q': search_query,
                    'num': min(10, limit),
                    'dateRestrict': 'y2',  # Sidste 2 år for up-to-date resultater
                    'lr': 'lang_da|lang_en',  # Dansk og engelsk
                }
                url = f"https://www.googleapis.com/customsearch/v1?{urlencode(params)}"

                async with self.session.get(url) as response:
                    if response.status != 200:
                        logger.warning(f"Google {cse_name} Search fejlede: %s", response.status)
                        return cse_sources

                    data = await response.json()
                    items = data.get('items', [])

                    for item in items:
                        link = item.get('link')
                        title = item.get('title', '')
                        snippet = item.get('snippet', '')

                        if not link:
                            continue

                        # Hent fuld kilde
                        source = await self._fetch_source(link)
                        if source is None:
                            continue
                        source.title = title or source.title
                        source.relevance_score = max(source.relevance_score, 0.7)

                        # Øg relevans for trusted domæner
                        if source.domain in self.trusted_domains:
                            source.relevance_score = max(source.relevance_score, 0.85)

                        if self._is_relevant(source.content or snippet, query):
                            source.relevance_score = max(source.relevance_score, 0.8)

                        cse_sources.append(source)

            except Exception as exc:
                logger.warning(f"Google {cse_name} Search forespørgsel fejlede: %s", exc)

            logger.info(f"Google {cse_name} CSE fandt {len(cse_sources)} kilder")
            return cse_sources

        # Kør begge CSEs parallelt
        if self.google_cse_id:
            search_tasks.append(search_cse(self.google_cse_id, search_query, "Specific Sites"))

        if self.google_cse_general_id:
            search_tasks.append(search_cse(self.google_cse_general_id, search_query, "General Web"))

        if search_tasks:
            results = await asyncio.gather(*search_tasks, return_exceptions=True)

            # Kombiner resultater fra begge CSEs
            for result in results:
                if isinstance(result, list):
                    for source in result:
                        if source.url not in seen_urls:
                            seen_urls.add(source.url)
                            sources.append(source)
                elif isinstance(result, Exception):
                    logger.warning(f"CSE søgning fejlede: {result}")

        # Sorter efter relevans og begræns til limit
        sources.sort(key=lambda x: x.relevance_score, reverse=True)
        sources = sources[:limit]

        logger.info(f"Google Custom Search kombineret fandt {len(sources)} unikke kilder")
        return sources

    async def _fetch_eur_lex_document(self, search_query: str) -> Optional[Source]:
        """Fetch the actual official document; never substitute stored prose."""
        normalized = search_query.lower()
        if "2024/1689" in normalized or "ai act" in normalized:
            url = "https://eur-lex.europa.eu/legal-content/DA/TXT/?uri=CELEX:32024R1689"
        elif "2016/679" in normalized or "gdpr" in normalized:
            url = "https://eur-lex.europa.eu/legal-content/DA/TXT/?uri=CELEX:32016R0679"
        else:
            return None
        source = await self._fetch_source(url, authority="EU")
        if source is None or not source.content.strip():
            return None
        source.source_type = "regulation"
        return source

    def _extract_domain(self, url: str) -> str:
        try:
            return urlsplit(url).netloc.lower()
        except Exception:
            parts = url.split('/')
            return parts[2].lower() if len(parts) > 2 else url

    def _deduplicate_sources(self, sources: List[Source]) -> List[Source]:
        dedup: Dict[str, Source] = {}
        for source in sources:
            # Tracking parameters do not identify a different document. Keep
            # semantic query parameters (including EUR-Lex uri/CELEX IDs).
            parts = urlsplit(source.url)
            query = [
                (name, value) for name, value in parse_qsl(parts.query, keep_blank_values=True)
                if not name.lower().startswith("utm_")
                and name.lower() not in {"trk", "gclid", "fbclid"}
            ]
            key = urlunsplit((parts.scheme.lower(), parts.netloc.lower(),
                             parts.path.rstrip('/'), urlencode(query), ""))
            existing = dedup.get(key)
            if not existing or source.relevance_score > existing.relevance_score:
                dedup[key] = source
        return list(dedup.values())

    async def _fetch_source(self, url: str, authority: str = None) -> Optional[Source]:
        """Read bounded HTML/PDF source bytes; never replace failed fetches."""
        if not self.session:
            return None
        max_bytes = 5 * 1024 * 1024
        try:
            async with self.session.get(url) as response:
                if response.status != 200:
                    return None
                if response.content_length is not None and response.content_length > max_bytes:
                    return None
                raw = bytearray()
                async for chunk in response.content.iter_chunked(65536):
                    raw.extend(chunk)
                    if len(raw) > max_bytes:
                        return None
                content_type = response.headers.get("Content-Type", "").lower()
                is_pdf = "application/pdf" in content_type or bytes(raw[:5]) == b"%PDF-"
                title = url
                if is_pdf:
                    from src.services.document_analyzer import parse_pdf
                    clean_content, _ = await asyncio.to_thread(parse_pdf, bytes(raw))
                else:
                    from bs4 import BeautifulSoup
                    soup = BeautifulSoup(bytes(raw), "html.parser")
                    if soup.title:
                        title = soup.title.get_text(" ", strip=True) or url
                    for element in soup(["script", "style", "noscript", "nav", "header", "footer", "aside"]):
                        element.decompose()
                    main_content = soup.find("main") or soup.find("article") or soup.find(attrs={"role": "main"}) or soup.body or soup
                    clean_content = main_content.get_text(separator=" ", strip=True)
                clean_content = " ".join(clean_content.split())[:20000]
                if not clean_content:
                    return None
                domain = self._extract_domain(url)
                source_info = self.trusted_domains.get(domain, {})
                return Source(
                    title=title, url=url, content=clean_content, domain=domain,
                    date_accessed=datetime.now(),
                    source_type="pdf" if is_pdf else source_info.get("type", "website"),
                    authority=authority or source_info.get("authority"),
                    relevance_score=0.7 if domain in self.trusted_domains else 0.3,
                )
        except Exception:
            logger.warning("Kildefilen kunne ikke hentes eller læses fra %s", self._extract_domain(url))
            return None

    def _is_relevant(self, content: str, query: str) -> bool:
        """Kontroller om indhold er relevant for søgeforespørgslen"""
        query_terms = [term for term in re.split(r"\W+", query.lower()) if len(term) > 3]
        content_lower = content.lower()

        relevance_keywords = [
            'ai', 'artificial intelligence', 'kunstig intelligens',
            'gdpr', 'databeskyttelse', 'personoplysninger',
            'automatiseret', 'automated', 'algoritme', 'algorithm',
            'compliance', 'overholdelse', 'regulering', 'regulation',
            'sag', 'klage', 'tilsyn', 'vejledning'
        ]

        term_hits = sum(1 for term in query_terms if term and term in content_lower)
        keyword_hits = sum(1 for keyword in relevance_keywords if keyword in content_lower)

        if term_hits >= 1:
            return True
        if keyword_hits >= 2:
            return True
        if term_hits >= 1 and keyword_hits >= 1:
            return True
        return False

    async def _generate_citations(self, query: str, sources: List[Source]) -> List[Citation]:
        """Generer præcise citationer fra kilder"""
        citations = []

        for source in sources[:5]:  # Top 5 kilder
            # Find relevante tekstpassager
            relevant_passages = self._extract_relevant_passages(source.content, query)

            for passage in relevant_passages:
                citation = Citation(
                    text=passage,
                    source=source,
                    confidence=0.9 if source.domain in self.trusted_domains else 0.6
                )
                citations.append(citation)

        return citations

    def _extract_relevant_passages(self, content: str, query: str) -> List[str]:
        """Udtrækker relevante tekstpassager"""
        if not content:
            return []

        # Opdel i sætninger
        sentences = re.split(r'[.!?]+', content)
        query_terms = [term.lower() for term in query.split() if len(term) > 2]

        relevant_passages = []
        for sentence in sentences:
            sentence = sentence.strip()

            # Filtrer ugyldige sætninger
            if len(sentence) < 50 or len(sentence) > 500:
                continue

            # Tjek for JSON/JavaScript/HTML artefakter
            if any(marker in sentence for marker in ['{', '}', '@type', '@id', 'JavaScript', 'script>', 'noscript']):
                continue

            # Tjek for URL fragments
            if sentence.startswith('http') or '//' in sentence[:20]:
                continue

            sentence_lower = sentence.lower()
            score = sum(1 for term in query_terms if term in sentence_lower)

            if score >= 2:  # Skal indeholde mindst 2 query terms
                relevant_passages.append(sentence)

        return relevant_passages[:3]  # Top 3 passager

    async def _generate_summary(self, query: str, sources: List[Source], citations: List[Citation]) -> str:
        """Generer sammenfatning baseret på kilder"""
        if not sources:
            return "Ingen relevante kilder fundet."

        summary = f"Research resultat for '{query}':\n\n"

        # Grupér efter autoritet
        by_authority = {}
        for source in sources:
            authority = source.authority or "Ukendt kilde"
            if authority not in by_authority:
                by_authority[authority] = []
            by_authority[authority].append(source)

        for authority, auth_sources in by_authority.items():
            summary += f"**{authority}:**\n"
            for source in auth_sources[:2]:  # Max 2 kilder per autoritet
                summary += f"- {source.title}\n"
            summary += "\n"

        return summary

    async def _extract_key_findings(self, sources: List[Source]) -> List[str]:
        """Udtrækker nøglefund fra kilder"""
        findings = []

        # Nøgleord for forskellige områder
        ai_act_keywords = ['artikel 5', 'forbudt', 'høj-risiko', 'high-risk', 'prohibited']
        gdpr_keywords = ['artikel 22', 'dpia', 'automatiseret', 'samtykke', 'consent']

        for source in sources:
            content_lower = source.content.lower()

            # AI Act findings
            for keyword in ai_act_keywords:
                if keyword in content_lower:
                    findings.append(f"AI Act: {keyword.title()} identificeret i {source.authority or source.domain}")
                    break

            # GDPR findings
            for keyword in gdpr_keywords:
                if keyword in content_lower:
                    findings.append(f"GDPR: {keyword.title()} krav identificeret i {source.authority or source.domain}")
                    break

        return list(set(findings))  # Fjern dubletter

    async def _extract_key_findings_with_llm(self, query: str, sources: List[Source]) -> List[str]:
        """Udtrækker detaljerede nøglefund med lovtekst citater."""
        if self.use_codex:
            return []
        if (not self.use_azure and not self.openai_api_key) or not sources:
            return await self._extract_key_findings(sources)

        docs = []
        for idx, source in enumerate(sources[:8], start=1):
            docs.append({
                "index": idx,
                "title": source.title,
                "authority": source.authority or source.domain,
                "url": source.url,
                "content_snippet": source.content[:1000]  # Mere kontekst
            })

        system_prompt = (
            "Du er en juridisk AI-compliance ekspert. Identificér 5-7 vigtige juridiske indsigter med specifikke lovtekst references. "
            "Hver finding skal være en STRING der inkluderer:\n"
            "- **Hovedpointe** med fet skrift\n"
            "- Relevant artikel/paragraf (f.eks. 'EU AI Act Artikel 5', 'GDPR Artikel 22')\n"
            "- Kort citat fra lovteksten i citationstegn hvis relevant\n"
            "Format: '**[Titel] ([Artikel])**: [Beskrivelse]. [Citat hvis relevant]'\n"
            "Returner JSON med 'findings' array af STRINGS (IKKE objekter). Hver finding skal være 2-3 sætninger."
        )

        user_prompt = (
            f"Emne: {query}\n\n"
            "Kilder:\n" + json.dumps(docs, ensure_ascii=False, indent=2) + "\n\n"
            "Hvad er de vigtigste juridiske indsigter med specifikke lovtekst references?"
        )

        payload = {
            "model": self.azure_deployment if self.use_azure else self.openai_model,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.2,
            "max_tokens": 1500,
        }

        try:
            if self.use_azure:
                url = f"{self.azure_endpoint}/openai/deployments/{self.azure_deployment}/chat/completions?api-version={self.azure_api_version}"
                headers = {"api-key": self.azure_api_key, "Content-Type": "application/json"}
            else:
                url = "https://api.openai.com/v1/chat/completions"
                headers = {"Authorization": f"Bearer {self.openai_api_key}", "Content-Type": "application/json"}

            async with self.session.post(url, headers=headers, json=payload) as response:
                if response.status != 200:
                    logger.warning("LLM key findings fejlede")
                    return await self._extract_key_findings(sources)
                data = await response.json()

            content = data["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            findings = parsed.get("findings", [])

            # Ensure all findings are strings (convert objects to strings if needed)
            string_findings = []
            for finding in findings:
                if isinstance(finding, str):
                    string_findings.append(finding)
                elif isinstance(finding, dict):
                    # Convert dict to formatted string
                    title = finding.get("Hovedpointe", finding.get("title", ""))
                    article = finding.get("Relevant artikel/paragraf", finding.get("article", ""))
                    quote = finding.get("Citat", finding.get("quote", ""))

                    formatted = f"**{title}"
                    if article:
                        formatted += f" ({article})"
                    formatted += "**"
                    if quote:
                        formatted += f": {quote}"
                    string_findings.append(formatted)

            return string_findings if string_findings else await self._extract_key_findings(sources)
        except Exception as exc:
            logger.warning(f"LLM key findings fejlede: {exc}")
            return await self._extract_key_findings(sources)

    async def _generate_recommendations_with_llm(self, query: str, sources: List[Source]) -> List[str]:
        """Generer anbefalinger med OpenAI LLM."""
        if self.use_codex or not self.openai_api_key or not sources:
            return []

        docs = []
        for idx, source in enumerate(sources[:6], start=1):
            docs.append({
                "index": idx,
                "title": source.title,
                "authority": source.authority or source.domain,
                "content_snippet": source.content[:600]
            })

        system_prompt = (
            "Du er en juridisk rådgiver. Baseret på de leverede kilder, generer 3-5 konkrete handlingsorienterede anbefalinger. "
            "Returner JSON med 'recommendations' array af strings. Hver anbefaling skal være konkret og actionable."
        )

        user_prompt = (
            f"Emne: {query}\n\n"
            "Kilder:\n" + json.dumps(docs, ensure_ascii=False, indent=2) + "\n\n"
            "Hvad skal organisationen gøre for at sikre compliance?"
        )

        payload = {
            "model": self.openai_model,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.3,
            "max_tokens": 800,
        }

        try:
            async with self.session.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.openai_api_key}",
                    "Content-Type": "application/json"
                },
                json=payload
            ) as response:
                if response.status != 200:
                    logger.warning("OpenAI recommendations fejlede")
                    return []
                data = await response.json()

            content = data["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            return parsed.get("recommendations", [])
        except Exception as exc:
            logger.warning(f"LLM recommendations fejlede: {exc}")
            return []

    async def _generate_recommendations(self, query: str, citations: List[Citation]) -> List[str]:
        """Generer anbefalinger baseret på citationer"""
        recommendations = []

        if any('artikel 5' in cite.text.lower() or 'prohibited' in cite.text.lower() for cite in citations):
            recommendations.append("Tjek for forbudte AI-praksisser jf. AI Act Artikel 5")

        if any('høj-risiko' in cite.text.lower() or 'high-risk' in cite.text.lower() for cite in citations):
            recommendations.append("Implementer krav til høj-risiko AI-systemer")

        if any('artikel 22' in cite.text.lower() or 'automatiseret' in cite.text.lower() for cite in citations):
            recommendations.append("Sikr compliance med GDPR Artikel 22 om automatiserede afgørelser")

        if any('dpia' in cite.text.lower() for cite in citations):
            recommendations.append("Gennemfør konsekvensanalyse for databeskyttelse (DPIA)")

        return recommendations

    def _source_to_dict(self, source: Source) -> Dict[str, Any]:
        """Konverter Source til dict med snippet"""
        # Extract a relevant snippet from content (first 200 chars or up to sentence end)
        snippet = ""
        if source.content:
            content = source.content.strip()
            if len(content) > 200:
                # Try to end at sentence boundary
                snippet = content[:200]
                last_period = snippet.rfind('.')
                if last_period > 100:  # Only use sentence boundary if it's not too short
                    snippet = content[:last_period + 1]
                else:
                    snippet = content[:200] + "..."
            else:
                snippet = content

        return {
            "title": source.title,
            "url": source.url,
            "domain": source.domain,
            "authority": source.authority,
            "source_type": source.source_type,
            "date_accessed": source.date_accessed.isoformat(),
            "date_published": source.date_published.isoformat() if source.date_published else None,
            "relevance_score": source.relevance_score,
            "snippet": snippet
        }

    def _citation_to_dict(self, citation: Citation) -> Dict[str, Any]:
        """Konverter Citation til dict"""
        return {
            "text": citation.text,
            "source": self._source_to_dict(citation.source),
            "page_number": citation.page_number,
            "section": citation.section,
            "confidence": citation.confidence
        }

    async def search(
        self,
        query: str,
        max_results: int = 5,
        focus_domains: Optional[List[str]] = None,
        progress_callback: Optional[callable] = None
    ) -> List[Source]:
        """Simpel søgemetode til quick check integration.

        Args:
            query: Søgeforespørgsel
            max_results: Maksimalt antal resultater
            focus_domains: Liste af prioriterede domæner
            progress_callback: Optional callback for progress updates

        Returns:
            Liste af Source objekter
        """
        logger.info(f"Søger efter: {query} (max {max_results} resultater)")

        all_sources = []

        # Parallel søgning i forskellige kilder
        search_tasks = []
        search_names = []

        # 1. DuckDuckGo (hurtigste, prioriteret først)
        if progress_callback:
            await progress_callback("Søger via DuckDuckGo...", "loading")
        search_tasks.append(self._search_duckduckgo(query, limit=max_results, focus_areas=focus_domains))
        search_names.append("DuckDuckGo")

        # 2. Autoritative kilder (parallelt)
        if progress_callback:
            await progress_callback("Søger i EUR-Lex database...", "loading")
        search_tasks.append(self._search_eur_lex(query))
        search_names.append("EUR-Lex")

        if progress_callback:
            await progress_callback("Søger på Datatilsynet.dk...", "loading")
        search_tasks.append(self._search_datatilsynet(query))
        search_names.append("Datatilsynet")

        if progress_callback:
            await progress_callback("Søger EDPB guidelines...", "loading")
        search_tasks.append(self._search_edpb_guidelines(query))
        search_names.append("EDPB")

        # 3. OpenAI source discovery (hvis tilgængelig)
        if not self.use_codex and self.openai_api_key:
            if progress_callback:
                await progress_callback("AI-baseret kildeopdagelse...", "loading")
            search_tasks.append(self._llm_discover_sources(query, ["AI Act", "GDPR", "compliance"]))
            search_names.append("OpenAI Discovery")

        # 4. Google Custom Search (kun hvis DuckDuckGo ikke finder nok)
        if self.google_api_key and self.google_cse_id:
            if progress_callback:
                await progress_callback("Backup Google Custom Search...", "loading")
            search_tasks.append(self._search_google(query, limit=max_results, focus_areas=focus_domains))
            search_names.append("Google CSE")

        # Kør alle søgninger parallelt
        if progress_callback:
            await progress_callback(f"Kører {len(search_tasks)} parallelle søgninger...", "loading")
        results = await asyncio.gather(*search_tasks, return_exceptions=True)

        # Saml resultater
        for idx, result in enumerate(results):
            source_name = search_names[idx] if idx < len(search_names) else "Unknown"
            if isinstance(result, list):
                all_sources.extend(result)
                if progress_callback and len(result) > 0:
                    await progress_callback(f"✓ {source_name}: {len(result)} resultater", "loading")
            elif isinstance(result, Exception):
                logger.warning(f"{source_name} fejlede: {result}")
                if progress_callback:
                    await progress_callback(f"⚠ {source_name} fejlede", "loading")

        # Deduplicate og sorter
        all_sources = self._deduplicate_sources(all_sources)
        all_sources.sort(key=lambda x: x.relevance_score, reverse=True)

        # Returner top resultater
        top_sources = all_sources[:max_results]
        logger.info(f"Fandt {len(top_sources)} kilder for: {query}")

        if progress_callback:
            await progress_callback(f"Fundet {len(top_sources)} unikke kilder (fra {len(all_sources)} totalt)", "loading")

        return top_sources

    async def summarize_with_citations(
        self,
        query: str,
        sources: List[Source],
        max_length: int = 200
    ) -> str:
        """Generer en kort sammenfatning med OpenAI LLM.

        Args:
            query: Spørgsmålet der skal besvares
            sources: Liste af kilder
            max_length: Maksimal længde i tegn

        Returns:
            Sammenfatning som string
        """
        if not sources:
            return "Ingen relevante kilder fundet."

        if not self.use_codex and not self.openai_api_key:
            # Fallback uden LLM
            return f"Fundet {len(sources)} relevante kilder fra {', '.join(set(s.authority or s.domain for s in sources[:3]))}."

        # Brug LLM til at opsummere
        docs = []
        for idx, source in enumerate(sources[:5], start=1):
            docs.append({
                "index": idx,
                "title": source.title,
                "authority": source.authority or source.domain,
                "snippet": source.content[:500]
            })

        system_prompt = (
            f"Du er en juridisk AI-compliance ekspert. Besvar spørgsmålet KORT og PRÆCIST på dansk (max {max_length} tegn). "
            "Brug kun information fra de leverede kilder. Nævn hvilke autoriteter der udtaler sig. "
            "Returner KUN teksten, ingen JSON eller formatering."
        )

        user_prompt = (
            f"Spørgsmål: {query}\n\n"
            "Kilder:\n" + json.dumps(docs, ensure_ascii=False, indent=2) + "\n\n"
            "Besvar kort baseret på kilderne."
        )

        payload = {
            "model": self.openai_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.2,
            "max_tokens": int(max_length * 0.8),  # Lidt buffer
        }

        try:
            if self.use_codex:
                from src.services.codex_text_provider import generate_text
                summary = await asyncio.to_thread(generate_text, system_prompt, user_prompt, max_tokens=int(max_length * 0.8))
                if not isinstance(summary, str) or not summary.strip():
                    return f"Fundet {len(sources)} kilder, men sammenfatning fejlede."
                return summary.strip()[:max_length]
            async with self.session.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.openai_api_key}",
                    "Content-Type": "application/json"
                },
                json=payload
            ) as response:
                if response.status != 200:
                    text = await response.text()
                    logger.warning(f"OpenAI summary fejlede: {response.status} - {text}")
                    return f"Fundet {len(sources)} kilder, men sammenfatning fejlede."

                data = await response.json()
                summary = data["choices"][0]["message"]["content"].strip()

                # Trim til max length hvis nødvendigt
                if len(summary) > max_length:
                    summary = summary[:max_length-3] + "..."

                return summary

        except Exception as exc:
            logger.warning(f"LLM summary exception: {exc}")
            return f"Fundet {len(sources)} relevante kilder fra autoritative domæner."
