# Local ESCO skill suggestions

Align uses an optional local import of the ESCO v1.2.1 English Classification CSV package to suggest recognised terms while a user creates a Skill. ESCO is a normalisation and discovery source only: it is never called at runtime, never receives a user query, and does not establish that a user possesses a Skill.

Use the extracted package (Classification, CSV, English) and run:

```bash
ESCO_DATASET_PATH=/absolute/path/to/esco-classification-en-csv npm run esco:import
# or
npm run esco:import -- --path "/absolute/path/to/esco-classification-en-csv"
```

The importer requires `skills_en.csv`, streams it in batches, and prints inserted, updated, skipped, and invalid counts. It does not download data, create user Skills, modify Projects, call an LLM, or need network access. To refresh, obtain and inspect a later compatible package, update the supported source/version intentionally, and rerun the explicit command. The imported source URI and version remain on the local taxonomy record; users' display names are not overwritten.

The data model deliberately has four separate concepts:

- **Taxonomy term**: an imported ESCO suggestion.
- **Skill**: a user-controlled, reusable evidence record. It may have no taxonomy term.
- **SkillGroup**: optional presentation grouping only.
- **ProjectSkill**: the user's statement that a Skill was used in a Project.

Free entry is mandatory for emerging, proprietary, local, or brand-specific Skills. Duplicate detection uses Unicode normalisation, trimmed/collapsed whitespace, and case-insensitive comparison while preserving meaningful punctuation such as `C++`, `C#`, `.NET`, `Node.js`, and `CI/CD`.

Do not commit the full downloaded dataset. Keep it in an ignored local import directory. The package supplied for import should retain its own included attribution and licence material; this repository does not invent replacement licence wording.
