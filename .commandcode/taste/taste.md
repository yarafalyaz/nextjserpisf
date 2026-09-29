# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# communication
- Use Indonesian (Bahasa Indonesia) for all interactions. Confidence: 0.85

# architecture
- Prefer dynamic/COA-driven options over hardcoded values (e.g., expense categories from COA instead of static dropdown). Confidence: 0.65

# ui-ux
- When removing or modifying form fields, consider the visual/layout impact on adjacent fields (e.g., grid gaps, empty columns, alignment). Confidence: 0.65
- Prefer shadcn UI primitives (Command, Select, Table, Skeleton, Breadcrumb, Card, DatePicker, AlertDialog) for ALL form controls and display components — no custom/bespoke implementations or native browser APIs (e.g., `window.confirm`). Confidence: 0.85
- All user-facing UI text (labels, descriptions, metadata, titles, status labels, button text) must be in Bahasa Indonesia, not English. Confidence: 0.70
- For filter/search dropdowns with many options, use shadcn Combobox (Command-based) instead of plain shadcn Select, so users can search/filter options. Confidence: 0.65

# workflow
See [workflow/taste.md](workflow/taste.md)
