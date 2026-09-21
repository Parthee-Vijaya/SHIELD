# Mistral-baseret juridisk research

Denne platform bruger Mistral LLM til at foreslå relevante kilder til juridisk research om AI-compliance.

## Domæne-whitelists

Kun kilder fra følgende domæner accepteres automatisk:

- kl.dk
- datatilsynet.dk
- edpb.europa.eu
- eur-lex.europa.eu
- commission.europa.eu
- consilium.europa.eu
- europa.eu

Hvis Mistral svarer med andre domæner, bliver de ignoreret.

## API-nøgle

Standardnøglen er sat i koden (`Szfm8pEVjf4nagSSLzHKjYS4WmXaWxA4`).
Sæt `MISTRAL_API_KEY` i miljøet for at override default-nøglen.
