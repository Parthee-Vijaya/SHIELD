const aiActDidYouKnowFacts = [
  // AI Teknologi & Koncepter
  {
    "id": "ai-001",
    "title": "MCP - Model Context Protocol",
    "text": "Model Context Protocol (MCP) er en ny åben standard fra Anthropic, der gør det muligt for AI-assistenter at forbinde til datakilde og værktøjer på en sikker måde. MCP erstatter behovet for custom integrationer med et universelt protokol, der fungerer på tværs af forskellige AI-systemer og platforme. Dette muliggør bedre kontekstbevidsthed og mere præcise AI-interaktioner.",
    "source": "https://www.anthropic.com/news/model-context-protocol"
  },
  {
    "id": "ai-002",
    "title": "AI Agenter",
    "text": "AI-agenter er autonome systemer, der kan udføre opgaver på vegne af brugere ved at kombinere LLM'er, værktøjer og eksterne API'er. Moderne agenter kan træffe beslutninger, anvende værktøjer, huske kontekst og tilpasse sig dynamisk. Frameworks som LangGraph og AutoGen gør det muligt at bygge komplekse multi-agent workflows med koordineret beslutningstagning og specialiserede roller.",
    "source": "https://www.langchain.com/langgraph"
  },
  {
    "id": "ai-003",
    "title": "RAG - Retrieval-Augmented Generation",
    "text": "RAG kombinerer information retrieval med text generation for at give AI-systemer adgang til opdateret, domænespecifik viden. Systemet henter relevant information fra en vidensbase og bruger det som kontekst for at generere præcise svar. Dette reducerer hallucinations og gør AI-systemer mere pålidelige til faktabaserede opgaver som juridisk rådgivning og compliance-checks.",
    "source": "https://arxiv.org/abs/2005.11401"
  },
  {
    "id": "ai-004",
    "title": "Large Language Models (LLM)",
    "text": "LLM'er som GPT-4, Claude og Gemini er trænet på massive mængder tekst og kan forstå og generere naturligt sprog på ekspertniveau. De bruges til alt fra kodegenerering til juridisk analyse. Med context windows på op til 200.000 tokens kan moderne LLM'er analysere hele lovtekster, kontrakter og regulatoriske dokumenter i en enkelt query, hvilket revolutionerer juridisk arbejde.",
    "source": "https://www.anthropic.com/claude"
  },
  {
    "id": "ai-005",
    "title": "Embeddings og Vektor Databaser",
    "text": "Embeddings konverterer tekst til numeriske vektorer, der repræsenterer semantisk mening. Dette gør det muligt at finde lignende dokumenter, clustere information og bygge intelligente søgesystemer. Vektor databaser som Qdrant, Pinecone og Weaviate optimerer lagring og søgning af embeddings, hvilket er fundamentet for RAG-systemer og semantisk søgning i compliance-platforme.",
    "source": "https://qdrant.tech/documentation/"
  },

  // EU AI Act
  {
    "id": "aiact-001",
    "title": "Højrisiko AI-systemer",
    "text": "AI Act definerer højrisiko AI-systemer som dem, der kan påvirke sikkerhed eller grundlæggende rettigheder. Dette inkluderer: biometrisk identifikation, kritisk infrastruktur, uddannelse og jobrekruttering, adgang til offentlige ydelser, retshåndhævelse, migrationsforvaltning og retsvæsen. Sådanne systemer skal gennemgå konformitetsvurdering, have CE-mærkning og registreres i EU-database før markedsføring.",
    "source": "https://artificialintelligenceact.eu/high-risk/"
  },
  {
    "id": "aiact-002",
    "title": "Forbudt AI - Uacceptabel risiko",
    "text": "AI Act forbyder AI-systemer med uacceptabel risiko: Social scoring af borgere, real-time biometrisk fjernidentifikation i offentligt rum (med snævre undtagelser), AI der manipulerer adfærd gennem subliminal påvirkning, AI der udnytter sårbare grupper, og emotion recognition på arbejdspladser/skoler. Overtrædelse kan føre til bøder på op til €35 millioner eller 7% af global omsætning.",
    "source": "https://artificialintelligenceact.eu/article/5/"
  },
  {
    "id": "aiact-003",
    "title": "General Purpose AI (GPAI)",
    "text": "GPAI-modeller som GPT-4 og Claude får særlige krav om dokumentation af træningsdata, energiforbrug, modelkort og risikohåndtering. Systemisk risiko GPAI (>10²⁵ FLOPs) skal gennemgå model evaluations, red-teaming og cybersikkerhedstests. Udbydere skal dele teknisk dokumentation med downstream-brugere, så de kan vurdere compliance-risici for deres specifikke anvendelser.",
    "source": "https://artificialintelligenceact.eu/title-iii/"
  },
  {
    "id": "aiact-004",
    "title": "Gennemsigtighed og menneskeligt tilsyn",
    "text": "Højrisiko AI skal designes med human oversight - evnen til at forstå, overvåge og gribe ind i AI-beslutninger. Brugere skal informeres når de interagerer med AI (chatbots, deepfakes). AI-genereret indhold skal tydeligt mærkes. Systemer skal dokumentere deres begrænsninger, så mennesker kan træffe informerede beslutninger om at stole på eller overstyre AI-anbefalinger.",
    "source": "https://artificialintelligenceact.eu/article/13/"
  },
  {
    "id": "aiact-005",
    "title": "Risikobaseret tilgang",
    "text": "AI Act bruger 4 risikoniveauer: Uacceptabel (forbudt), Høj (strenge krav), Begrænset (transparenskrav) og Minimal (frivillige guidelines). Denne tilgang balancerer innovation med beskyttelse - lavrisiko AI-værktøjer kan udvikles frit, mens højrisiko systemer skal opfylde omfattende dokumentations-, test- og tilsynskrav før og efter markedsføring.",
    "source": "https://artificialintelligenceact.eu/"
  },

  // GDPR
  {
    "id": "gdpr-001",
    "title": "Artikel 6 - Lovlig behandling",
    "text": "GDPR Artikel 6 definerer 6 lovlige grundlag for databehandling: (a) Samtykke, (b) Kontraktopfyldelse, (c) Lovpligt, (d) Vitale interesser, (e) Offentlig opgave, (f) Legitim interesse. AI-systemer skal identificere hvilket grundlag de bruger. Samtykke skal være frit, specifikt, informeret og utvetydigt. Legitim interesse kræver balancetest mod den registreredes rettigheder.",
    "source": "https://gdpr-info.eu/art-6-gdpr/"
  },
  {
    "id": "gdpr-002",
    "title": "Artikel 22 - Automatiserede beslutninger",
    "text": "GDPR Artikel 22 giver borgere ret til ikke at være underlagt udelukkende automatiserede beslutninger med retlig eller tilsvarende betydelig effekt. Dette omfatter AI-baseret kreditvurdering, jobrekruttering og forsikringspræmier. Undtagelser kræver eksplicit samtykke eller kontraktuel nødvendighed, plus passende sikkerhedsforanstaltninger som human review og ret til forklaring.",
    "source": "https://gdpr-info.eu/art-22-gdpr/"
  },
  {
    "id": "gdpr-003",
    "title": "Privacy by Design",
    "text": "GDPR Artikel 25 kræver Privacy by Design og Default - databeskyttelse skal integreres fra projektets start, ikke tilføjes bagefter. AI-systemer skal bruge dataminimering, pseudonymisering og kryptering som standard. Kun nødvendige personoplysninger må behandles, og brugere skal have maximale privatlivsindstillinger som default. Dette påvirker AI-træning, inferens og dataopbevaring.",
    "source": "https://gdpr-info.eu/art-25-gdpr/"
  },
  {
    "id": "gdpr-004",
    "title": "DPIA - Data Protection Impact Assessment",
    "text": "Ved højrisiko databehandling (systematisk monitoring, store mængder følsomme data, automatiserede beslutninger) kræver GDPR en DPIA før implementering. For AI betyder dette: beskrivelse af behandlingen, nødvendighedsvurdering, risikovurdering for rettigheder, og afhjælpende foranstaltninger. EDPB's guidelines specificerer at AI-profilering og ML-modeller ofte kræver DPIA.",
    "source": "https://gdpr-info.eu/art-35-gdpr/"
  },
  {
    "id": "gdpr-005",
    "title": "Dataportabilitet og indsigt",
    "text": "GDPR giver borgere ret til at modtage deres data i struktureret, almindeligt anvendt format (portabilitet) og ret til indsigt i behandlingen. For AI-systemer betyder dette: brugere kan anmode om de data AI'en har om dem, hvordan data bruges til træning/inferens, og logik bag automatiserede beslutninger. Dette udfordrer 'black box' ML-modeller og kræver forklarbare AI-systemer.",
    "source": "https://gdpr-info.eu/art-15-gdpr/"
  },

  // Data Act
  {
    "id": "dataact-001",
    "title": "Data Act - Datadeling",
    "text": "EU's Data Act (2024) giver brugere og virksomheder ret til adgang til data genereret af IoT-enheder og connected products. For AI betyder dette adgang til træningsdata fra smart devices. Virksomheder skal designe produkter med data portability, så brugere kan dele data med tredjeparts AI-tjenester. Dette fremmer konkurrence og innovation i AI-økosystemet.",
    "source": "https://digital-strategy.ec.europa.eu/en/policies/data-act"
  },
  {
    "id": "dataact-002",
    "title": "B2B datadeling",
    "text": "Data Act regulerer B2B datadeling og forbyder unfair kontraktvilkår. SMV'er kan ikke tvinges til at dele data eksklusivt. For AI-platforme betyder dette: fair vilkår for datadeling med partnere, transparens om hvordan delt data bruges til AI-træning, og ret til at afslutte datadelingsaftaler. Cloud providers får særlige forpligtelser om data switching og interoperabilitet.",
    "source": "https://digital-strategy.ec.europa.eu/en/policies/data-act"
  },

  // Compliance & Best Practices
  {
    "id": "comp-001",
    "title": "AI Governance Framework",
    "text": "En robust AI governance inkluderer: AI-styregruppe med tværfaglig ekspertise, AI-politikker og standarder, risikoregister for AI-systemer, godkendelsesprocesser for nye AI-projekter, incident response procedures, og løbende monitoring. Best practice er at etablere en AI Ethics Board med repræsentation fra jura, IT-sikkerhed, HR, compliance og forretning til at evaluere AI-risici.",
    "source": "https://www.iso.org/standard/81230.html"
  },
  {
    "id": "comp-002",
    "title": "Modelkort og dokumentation",
    "text": "Modelkort dokumenterer: formål, træningsdata, arkitektur, performance metrics, begrænsninger, bias tests og use cases. For compliance skal modelkort omfatte: retligt grundlag for databehandling, DPIA-resultater, sikkerhedsforanstaltninger, human oversight procedures og incident logs. Google's Model Cards og Hugging Face's Model Cards sætter industristandarden for transparent AI-dokumentation.",
    "source": "https://arxiv.org/abs/1810.03993"
  },
  {
    "id": "comp-003",
    "title": "Bias detection og fairness",
    "text": "AI-systemer skal testes for bias across protected characteristics (køn, alder, etnicitet). Tekniske metoder inkluderer: Demographic Parity, Equal Opportunity, Disparate Impact Ratio. For højrisiko AI kræver EU standarder bias testing på repræsentative datasæt. Tools som IBM AI Fairness 360, Microsoft Fairlearn og Google What-If Tool hjælper med at detektere og mitigere bias.",
    "source": "https://www.iso.org/standard/77607.html"
  },
  {
    "id": "comp-004",
    "title": "Explainable AI (XAI)",
    "text": "Explainable AI teknikker gør 'black box' modeller forståelige: SHAP values viser feature importance, LIME giver local explanations, Attention mechanisms visualiserer hvad modellen fokuserer på. For GDPR Artikel 22 compliance skal automatiserede beslutninger kunne forklares. EU standarder kræver at forklaringer er meningsfulde for den registrerede, ikke kun for teknikere.",
    "source": "https://christophm.github.io/interpretable-ml-book/"
  },
  {
    "id": "comp-005",
    "title": "Incident respons og monitoring",
    "text": "Højrisiko AI skal have logging af: input/output, beslutningsparametre, human interventions og anomalies. Incident response omfatter: detection af model drift/bias, escalation procedures, corrective actions og myndighedsrapportering (15 dage for alvorlige hændelser). MLOps best practice inkluderer continuous monitoring dashboards med alerts for performance degradation og fairness metrics.",
    "source": "https://artificialintelligenceact.eu/article/61/"
  },

  // Fun Facts & Trends
  {
    "id": "fun-001",
    "title": "AI's energiforbrug",
    "text": "Træning af GPT-3 brugte ~1,287 MWh elektricitet - nok til at drive en gennemsnits dansk husstand i 107 år! EU AI Act kræver rapportering af energiforbrug for store GPAI-modeller. Virksomheder optimerer nu med teknikker som model pruning, quantization og efficient architectures (MobileNet, DistilBERT) for at reducere carbon footprint og opfylde ESG-mål.",
    "source": "https://arxiv.org/abs/2104.10350"
  },
  {
    "id": "fun-002",
    "title": "AI i retsvæsenet",
    "text": "Danske domstole eksperimenterer med AI til juridisk research og dokumentanalyse, men AI må ikke træffe retlige afgørelser selv (GDPR Art. 22). Estland planlagde en 'robot dommer' til småsager under €7000, men projektet blev suspenderet grundet etiske bekymringer. AI Act klassificerer AI i retshåndhævelse og domstole som højrisiko, hvilket kræver streng human oversight og appeals-mekanismer.",
    "source": "https://www.domstol.dk/"
  },
  {
    "id": "fun-003",
    "title": "Størrelsen af AI-modeller",
    "text": "GPT-3 har 175 milliarder parametre, GPT-4 angiveligt over 1 trillion, mens Claude 3 Opus konkurrerer i samme liga. Til sammenligning har den menneskelige hjerne ~86 milliarder neuroner. Men antal parametre ≠ intelligens - mindre, specialiserede modeller kan outperform store generalist modeller på specifikke opgaver. Trends går mod 'mixture of experts' arkitekturer der aktiverer kun relevante dele af modellen.",
    "source": "https://arxiv.org/abs/2005.14165"
  },
  {
    "id": "fun-004",
    "title": "AI Hallucinations",
    "text": "LLM'er kan hallucinate - generere plausibel men forkert information, inklusive fake lovparagraffer og ikke-eksisterende retssager! En New York advokat blev sanktioneret for at citere AI-opfundne sager i retten. For juridisk AI er hallucination detection kritisk. Teknikker inkluderer: citation verification, confidence scoring, RAG for faktabaserede svar, og human review af AI-genereret juridisk arbejde.",
    "source": "https://www.nytimes.com/2023/05/27/nyregion/avianca-airline-lawsuit-chatgpt.html"
  },
  {
    "id": "fun-005",
    "title": "Multimodal AI",
    "text": "Moderne AI kan nu behandle tekst, billeder, lyd og video samtidig! GPT-4V, Claude 3 og Gemini kan analysere juridiske dokumenter med diagrammer, screenshots af kontrakter og selv videodepositions. For compliance betyder dette mulighed for at analysere security footage for GDPR-overtrædelser, OCR af scannede kontrakter og accessibility improvements. EU AI Act's definition af AI-systemer omfatter alle modaliteter.",
    "source": "https://www.anthropic.com/claude"
  },

  // Datatilsynet & Dansk kontekst
  {
    "id": "dk-001",
    "title": "Datatilsynet og AI",
    "text": "Datatilsynet er Danmarks databeskyttelsesmyndighed og vil også håndhæve EU AI Act i Danmark. Tilsynet har udstedt guidelines om GDPR-compliance for AI, inklusive krav til transparens i automatiserede beslutninger. I 2024 iværksatte Datatilsynet fokuskampagner om AI i rekruttering og kreditvurdering. Virksomheder kan søge vejledning hos Datatilsynet før implementering af højrisiko AI-systemer.",
    "source": "https://www.datatilsynet.dk/"
  },
  {
    "id": "dk-002",
    "title": "AI i dansk offentlig sektor",
    "text": "Danske kommuner og regioner anvender AI til: sagsbehandling, chatbots, forudsigelse af socialt udsatte børn, og ressourceoptimering. Digitaliseringsstyrelsen og KL (Kommunernes Landsforening) har udgivet guidelines for ansvarlig AI i det offentlige. Offentlige AI-systemer skal overholde både AI Act og forvaltningsloven, hvilket stiller ekstra krav til begrundelser og klageadgang.",
    "source": "https://www.kl.dk/"
  },

  // Tekniske detaljer
  {
    "id": "tech-001",
    "title": "Fine-tuning vs RAG",
    "text": "Fine-tuning træner en eksisterende LLM på domænespecifik data for at specialisere dens evner (f.eks. juridisk sprog). RAG holder modellen generel men giver den adgang til opdateret knowledge base. For compliance: RAG er ofte bedre fordi juridiske regler ændrer sig, RAG tillader citation af kilder, og RAG kræver ikke gentagende model-træning. Hybrid approaches kombinerer begge teknikker.",
    "source": "https://arxiv.org/abs/2005.11401"
  },
  {
    "id": "tech-002",
    "title": "Prompt Engineering",
    "text": "Prompt engineering optimerer hvordan vi kommunikerer med LLM'er for bedre resultater. Teknikker inkluderer: few-shot examples, chain-of-thought reasoning, role prompting, og system instructions. For juridisk AI: strukturerede prompts med clear instructions, inclusion af relevant precedents, step-by-step reasoning for komplekse spørgsmål. Good prompts kan forbedre accuracy med 20-40% uden model changes.",
    "source": "https://www.promptingguide.ai/"
  },
  {
    "id": "tech-003",
    "title": "Token limits og chunking",
    "text": "LLM'er har context window limits (GPT-4: 128k tokens, Claude: 200k tokens, ~1 token ≈ 0.75 ord). For lange juridiske dokumenter kræves chunking strategies: semantic chunking (split ved paragraffer), sliding windows med overlap, eller hierarchical summarization. For compliance docs skal chunking bevare juridisk kontekst - f.eks. ikke splitte Artikel 6's underpunkter.",
    "source": "https://www.anthropic.com/index/claude-2-1"
  },

  // Fremtidige trends
  {
    "id": "future-001",
    "title": "AI Agents evolution",
    "text": "Næste generation AI-agents kan: booke møder, analysere kontrakter, udarbejde DPIA'er og koordinere med andre agents uden human intervention. AutoGPT, BabyAGI og LangGraph demonstrerer autonomous workflows. For virksomheder betyder dette AI-drevne compliance assistants der proaktivt identificerer risici. Men EU AI Act kræver at kritiske beslutninger har human oversight - agents kan anbefale, ikke afgøre.",
    "source": "https://www.langchain.com/langgraph"
  },
  {
    "id": "future-002",
    "title": "Federated Learning",
    "text": "Federated Learning træner AI-modeller på decentraliserede data uden at dele rå data - perfekt til privacy-sensitive anvendelser. Hospitaler kan samarbejde om AI-diagnostik uden at dele patientjournaler. For GDPR minimerer dette databehandling og risiko. Google bruger federated learning til keyboard predictions. EU AI Act fremmer privacy-enhancing technologies som federated learning til højrisiko systemer.",
    "source": "https://arxiv.org/abs/1602.05629"
  }
];

export default aiActDidYouKnowFacts;
