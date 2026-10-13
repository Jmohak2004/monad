# Ghar

## Brief

Self-authored from the locked plan. The feel was already chosen: a note to family.

- What: send dollars home as a WhatsApp link. Family in the UAE or US paying family in India. No crypto words.
- Core action: set an amount, then share the link.
- Feel: warm, plain, one quiet accent. The blue door is the version that was picked.
- Exists: the Next.js site at https://ghar-psi.vercel.app. Android is a Chrome shell that opens that site.
- Need: restyle those screens. No second app, no SwiftUI.

## Current app

Light ground `#f8f4ec`, dark ground `#12110f`, money-green accent. The send screen is stacked rounded cards. That is the category default.

Keep: first name, passkey create, balance, add money, amount, $50 / $100 / $200, fee against Wise, send, share link, claim states, history, no crypto vocabulary.

Lose: green-for-money, pill cards, a screen whose first object is a balance tile.

## Concepts

1. **Aerogramme.** A folded airmail letter. Light newsprint, New York, stamp red. Printed. Light. Serif. Red. Shape.
2. **Night kitchen.** The table after the children are in bed. Dark plaster, SF Rounded, lamp amber. Place. Dark. Rounded. Orange. Colour-material.
3. **Front door.** The painted door you knock on. Door-blue field, SF Pro Expanded, white ink. Object. Colour-field. Expanded. Blue. Colour-material.

## Pick

Front door. Picked by eye from the three send screens: the blue field. The letter lost because it left most of the page empty. The kitchen lost because a dark ground is the look this app is leaving.

## Tokens

- Ground: `#1436c8` (the door). Night: `#0c1f78`.
- Ink: `#f4f6ff`
- Quiet ink: `#d5defa`
- Hairline: `rgba(255, 255, 255, 0.35)`
- The button is the ink, not a second hue: fill `#f4f6ff`, label `#1436c8`
- Type: SF Pro, expanded (stretch 140%) for the amount and the headline. Normal width for rows.
- Shape: square chips with a hairline, square button, rules instead of cards.
- One field of blue. It means the door you are sending money through. It does not change per section.
