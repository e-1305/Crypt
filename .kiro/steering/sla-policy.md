---
inclusion: always
---
# Prioritization & SLA policy (deterministic)

Order: Impostor (OSV MAL-) > Possessed (in CISA KEV) > Rotting by EPSS desc > Rotting by CVSS desc.
States: Healthy | Rotting | Possessed (Tier 1). Impostor, Glowing and Necrotic come later.
SLA: Possessed = 48h. EPSS >= 0.1 = this sprint. Others = backlog.
Noise exorcism: only Possessed limbs and Rotting limbs with EPSS >= 0.1 spawn as monsters in the game.

Invariants (property-tested):
- KEV always outranks non-KEV.
- Score is monotonic in EPSS.
- Ranking is stable for equal inputs.
