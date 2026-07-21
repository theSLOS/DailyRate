---
name: user_js_familiarity
description: User's JavaScript/TypeScript experience level, for calibrating teaching depth
metadata:
  type: user
---

User's background is Python and C++ (stated directly, 2026-07-21), not JavaScript/TypeScript specifically. They are comfortable with general programming concepts (loops, transforms, immutability, copying vs. aliasing) but need JS/TS *idioms* mapped onto equivalents they already know, rather than taught from absolute first principles — array methods (`.map`/`.filter`) map to Python's `map()`/list comprehensions, the object spread operator maps to Python's `{**dict, key: val}` unpacking or constructing a modified copy of a struct in C++, arrow functions map to lambdas, type-vs-value distinctions are a TS-specific wrinkle (no real Python/C++ equivalent, since Python has no compile-time erased types and C++ types aren't used as values either) and still need explaining directly. See [[project-phase-status]] and [[feedback_concept_explanation_format]] for the workflow this happens inside (guide+review, teacher mode requested explicitly for the replies feature).

**How to apply:** when teaching or reviewing code in this project, lead with "this is like X in Python/C++" for standard JS idioms rather than building up from scratch — it lands faster and respects existing skill. Still slow down and use small isolated examples for anything JS/TS-specific with no clean analogue (type erasure, `undefined` vs `null`, prototype-based `this`, etc.). Continue naming the underlying principle behind fixes (a standing project convention per CLAUDE.md), but check understanding before stacking a new concept on top.
