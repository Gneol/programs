import { GneolProgram, SubagentDeclaration } from './types';
import { getGlobalSoulStore, Soul } from '../db/program';

/**
 * Apply subagent declarations from a parsed .gneol program to the soul store.
 *
 * For each subagent declaration:
 *  - If `name` is provided, search existing souls with the same parentId for a match.
 *    If found, update it; otherwise create a new subagent soul.
 *  - If `id` is provided, use it as the soul's ID (overrides auto-generated UUID).
 *  - `description` becomes the soul's `backstory`.
 *
 * The subagent's parentId is set to the root soul ID associated with this program.
 */
export function applySubagents(program: GneolProgram, rootSoulId: string): void {
    console.log('APPLY SUBAGENTS CALLED with program:', program.title, 'rootSoulId:', rootSoulId);
    console.log('Subagent declarations:', program.subagentDeclarations);
    const declarations = program.subagentDeclarations;
    if (!declarations || declarations.length === 0) {
        return;
    }

    const store = getGlobalSoulStore();
    const existingSubagents = store.getSiblingSouls(rootSoulId);

    for (const decl of declarations) {
        applyOneSubagent(store, decl, existingSubagents, rootSoulId, program);
    }
}

/**
 * Resolve a subagent reference (id or name) to a soul id.
 * If the reference directly matches an existing soul id, return it.
 * Otherwise search for a soul with matching name under the given parentId.
 * Falls back to global search if not found among siblings.
 * Returns null if no match found.
 */
export function resolveSubagentRef(subagentRef: string, parentId: string): string | null {
    const store = getGlobalSoulStore();

    // Try direct id lookup first
    const direct = store.get(subagentRef);
    if (direct) {
        return direct.id;
    }

    // Treat as name — search siblings (same parentId)
    const siblings = store.getSiblingSouls(parentId);
    const matched = siblings.find(s => s.name === subagentRef);
    if (matched) {
        return matched.id;
    }

    // Also search all souls globally by name (fallback)
    const all = store.list();
    const globalMatch = all.find(s => s.name === subagentRef);
    if (globalMatch) {
        return globalMatch.id;
    }

    return null;
}

function applyOneSubagent(
    store: ReturnType<typeof getGlobalSoulStore>,
    decl: SubagentDeclaration,
    existingSubagents: Soul[],
    parentId: string,
    program: GneolProgram
): void {
    const { name, id, description, model } = decl;

    if (!name) {
        console.warn('Subagent declaration without name — skipping');
        return;
    }

    // Look for an existing subagent with the same name (and parentId)
    let existing = existingSubagents.find(s => s.name === name);

    if (existing) {
        // Update existing subagent
        const updates: Partial<{
            name: string;
            backstory: string;
            llm: string;
            program: string;
            programPath: string;
            workSpace: string;
        }> = {};

        // If id is provided, we could update the soul's id, but id is immutable in the store.
        // The user may want to set the soul's id to a custom value. However, the update method
        // does not support changing id because it's the key. We'll log a warning if id is given
        // and differs from the existing soul's id.
        if (id && id !== existing.id) {
            console.warn(
                `Subagent "${name}" already exists with id "${existing.id}". ` +
                `Cannot change id to "${id}" — ignoring id override.`
            );
        }

        if (description !== undefined) {
            updates.backstory = description;
        }
        if (model !== undefined) {
            updates.llm = model;
        }
        // Keep program info in sync with parent
        updates.program = program.title;
        updates.programPath = program.path;
        updates.workSpace = program.path; // or a dedicated subfolder?

        store.update(existing.id, updates);
    } else {
        // Create new subagent
        const soul = store.create({
            id: id || undefined, // let constructor generate UUID if not provided
            name,
            program: program.title,
            programPath: program.path,
            llm: model || '',
            backstory: description || '',
            parentId,
            notes: [],
            workSpace: program.path, // same workspace as parent, or could be a subfolder
        });
        // Note: if id was provided and already exists, store.create will throw?
        // The current create() does not check for duplicate id; it just overwrites the file.
        // We could add a check but for now we trust the directive.
    }
}
