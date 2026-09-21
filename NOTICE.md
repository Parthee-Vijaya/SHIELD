# Oprindelse og tredjepartsindhold

SHIELD er videreudviklet fra [Parthee-Vijaya/Judge_dredd](https://github.com/Parthee-Vijaya/Judge_dredd). Det første SHIELD-snapshot bygger på den lokale arbejdsversion efter commit `fae694a` og de efterfølgende ændringer i sagsforløb, dokumentgrundlag, AI-udarbejdelse, JEV-kontrol og rapporter. Den oprindelige Git-historik, lokale databaser og adgangsoplysninger er ikke en del af det nye repository.

## Skabeloner og offentlige kilder

- `templates/dpia/konsekvensanalyse-ai.xlsx` stammer fra **Datatilsynet**: [Skabelon til konsekvensanalyse vedrørende AI](https://www.datatilsynet.dk/Media/638519447926128212/Skabelon%20til%20konsekvensanalyse%20vedr%c3%b8rende%20AI.xlsx). Originalen er bevaret, fordi løsningen kontrollerer skabelonens hash før eksport. Genererede vurderinger er ikke udarbejdet eller godkendt af Datatilsynet.
- `data/eu_ai_act_checker/` indeholder indhold fra **Europa-Kommissionens AI Act Compliance Checker**. Oprindelses- og versionsoplysninger fremgår af `_meta.json`; kildehenvisninger er bevaret.
- Lovtekster, vejledninger og nyhedsreferencer bevarer deres kildehenvisninger. De kan være historiske og skal kontrolleres mod den aktuelle officielle kilde før faglig anvendelse.
- Logoer og navne tilhører deres respektive rettighedshavere. Visning af Kalundborg Kommunes profil er ikke dokumentation for kommunal drift, tilslutning eller godkendelse.
- Krisp-billederne i README viser en planlagt, afgrænset anvendelse og et AI-udarbejdet arbejdsgrundlag. De dokumenterer hverken et faktisk indkøb eller en kommunal godkendelse.

## Licensstatus

Der er ikke fastsat en samlet open source-licens for SHIELD i dette repository. En ældre README omtalte MIT uden en tilhørende licensfil; den påstand videreføres ikke. Tredjepartsbiblioteker, offentlige dokumenter, skabeloner og varemærker er underlagt deres egne vilkår.
