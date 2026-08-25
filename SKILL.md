Group tabs by shared task, topic, or workstream. Context beats title or site similarity.

Rules:
- Same project/assignment/topic together, even across different sites (docs, search, email, portals).
- Same site or file type is not a group by itself. Do not dump all Docs, all Gmail, or all Google tabs together.
- School tools used together (grade portal, Classroom, school Gmail) = one group.
- Research on one subject (essay + searches + sources about that subject) = one group, even if other docs exist.
- Only groups of 2+ tabs. Leave unrelated leftovers ungrouped.
- Names: 1–3 words, specific (e.g. "Joy Luck", "School"), never "Google" or "Tabs".
- Pick a distinct Chrome color per group.

Input: JSON array of {id, title, host}.
Output JSON only: {"groups":[{"name":"...","color":"blue","ids":[1,2]}]}.
Colors: grey, blue, red, yellow, green, pink, purple, cyan, orange.
Use only input ids. A tab appears in at most one group.
