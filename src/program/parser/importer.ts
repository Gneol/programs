// ============================================================================
// Import resolver — flattens import() directives by merging file contents
// ============================================================================

import fs from 'fs';
import path from 'path';

const importPattern = /^import\(['"]([^'"]+)['"]\)/gm;
const programHeaderPattern = /^program\("[^"]+"\)[^\n]*\n?/m;

/**
 * Recursively resolve import() directives in a .gneol file.
 * Returns the content with import lines replaced by the imported file's
 * inner directives (program header removed).
 */
export function mergeImports(filePath: string, resolved: Set<string> = new Set(), stripHeader: boolean = false): string {
    const absolutePath = path.resolve(filePath);
    if (resolved.has(absolutePath)) {
        console.warn(`Circular import detected: ${absolutePath} — skipping`);
        return '';
    }

    if (!fs.existsSync(absolutePath)) {
        console.warn(`Import file not found: ${absolutePath} — skipping`);
        return '';
    }

    let content = fs.readFileSync(absolutePath, 'utf-8');
    const dir = path.dirname(absolutePath);

    // Only strip program header AND its sub-directives for imported files, not the root
    if (stripHeader) {
        // Match program line + any following sub-directive lines as a single block
        content = content.replace(/^program\("[^"]+"\)[^\n]*\n?(\s*\..*\n?)*/m, '');
    }

    resolved.add(absolutePath);

    // Find and replace each import() line — single pass to avoid lastIndex desync
    content = content.replace(importPattern, (match: string, importPath: string) => {
        const resolvedImportPath = path.resolve(dir, importPath);
        return mergeImports(resolvedImportPath, resolved, true);
    });

    // For the root file, move all imported content to after the program header block
    if (!stripHeader) {
        content = moveImportsAfterProgram(content);
    }

    return content;
}

/**
 * Moves any content appearing before the program() header line to after its sub-directives.
 * This ensures imported directives always come after the root's header block.
 */
function moveImportsAfterProgram(content: string): string {
    const programMatch = content.match(programHeaderPattern);
    if (!programMatch) return content;

    const programLineIndex = content.indexOf(programMatch[0]);
    const preProgramContent = content.slice(0, programLineIndex);
    const programAndAfter = content.slice(programLineIndex);

    // Determine the end of the header block (program line + its sub-directives)
    const lines = programAndAfter.split('\n');
    let headerEndIndex = 1; // skip the program line itself
    for (let i = 1; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        // Keep consuming blank lines, comments, and sub-directive lines
        if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('.')) {
            headerEndIndex = i + 1;
        } else {
            break;
        }
    }

    const headerBlock = lines.slice(0, headerEndIndex).join('\n');
    const restAfterHeader = lines.slice(headerEndIndex).join('\n');

    // Prepend the imported content after the header block
    let result = headerBlock + '\n';
    if (preProgramContent.trim()) {
        result += preProgramContent + '\n';
    }
    result += restAfterHeader;
    return result;
}
