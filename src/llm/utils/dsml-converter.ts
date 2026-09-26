/**
 * Converts DSML tool-call markup into an OpenAI-compatible `tool_calls` array.
 *
 * Supported delimiters (interchangeable; whitespace between the delimiter and
 * the tag name is optional):
 *   <｜DSML｜invoke name="…">              single fullwidth pipe
 *   <｜｜DSML｜｜ invoke name="…">         double fullwidth pipe
 *   <||DSML||invoke name="…">              ascii pipes
 *   <｜｜DSML｜｜ calls>                    optional container (calls | tool_calls)
 *
 * Parameter bodies carry an optional `string="true|false"` hint. When it is
 * missing or "false" the body is parsed as JSON (object, array, number, bool,
 * null) and falls back to the raw string when parsing fails. A parameter
 * literally named `arguments` / `args` whose body is a JSON object is treated
 * as the argument object itself and merged into the call.
 *
 * Truncated / streamed output (unterminated tags) is tolerated: a tag body is
 * read up to the end of the input.
 */

/** ｜ (U+FF5C) — the fullwidth pipe these models emit. */
const FW_PIPE = '\uFF5C';

const DELIM = `(?:${FW_PIPE}+DSML${FW_PIPE}+|\\|+\\s?DSML\\s?\\|+)`;
const TAG = `${DELIM}\\s*`;

const RE_INVOKE = new RegExp(
    `<${TAG}invoke\\b([^>]*?)>([\\s\\S]*?)(?:<\\/${TAG}invoke\\s*>|$)`,
    'g'
);
const RE_PARAM = new RegExp(
    `<${TAG}parameter\\b([^>]*?)>([\\s\\S]*?)(?:<\\/${TAG}parameter\\s*>|$)`,
    'g'
);
const RE_CONTAINER = new RegExp(`<\\/?${TAG}(?:tool_)?calls\\b[^>]*>`, 'g');
const RE_INVOKE_BLOCK = new RegExp(
    `<${TAG}invoke\\b[^>]*>[\\s\\S]*?(?:<\\/${TAG}invoke\\s*>|$)`,
    'g'
);
const RE_PARAM_BLOCK = new RegExp(
    `<${TAG}parameter\\b[^>]*>[\\s\\S]*?(?:<\\/${TAG}parameter\\s*>|$)`,
    'g'
);
const RE_TAG = new RegExp(`<\\/?${TAG}[a-z_]+\\b[^>]*>`, 'gi');
const RE_ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const RE_FENCE = /^```[a-z]*\s*\n([\s\S]*?)\n?```$/i;

const ENTITIES: Record<string, string> = {
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
};

export type DsmlToolCall = {
    function: { name: string; arguments: string };
};

export type DsmlMessage = {
    toolCalls: DsmlToolCall[] | null;
    text: string;
};

type Attrs = Record<string, string | undefined>;
type Args = Record<string, unknown>;
type JsonResult = { ok: true; value: unknown } | { ok: false };

function parseAttrs(str: string): Attrs {
    const attrs: Attrs = {};
    RE_ATTR.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RE_ATTR.exec(str)) !== null) {
        attrs[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3];
    }
    return attrs;
}

function decodeEntities(str: string): string {
    return str.replace(/&(?:quot|apos|#39|lt|gt|amp);/g, (e) => ENTITIES[e] ?? e);
}

function stripFence(str: string): string {
    const m = RE_FENCE.exec(str.trim());
    return m ? m[1].trim() : str.trim();
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Lenient JSON.parse: strips code fences, retries on unescaped entities and
 * trailing commas before giving up. */
function safeJsonParse(raw: string): JsonResult {
    const text = stripFence(String(raw));
    if (text === '') return { ok: false };
    const relaxed = text.replace(/,(\s*[}\]])/g, '$1');
    for (const candidate of [
        text,
        decodeEntities(text),
        relaxed,
        decodeEntities(relaxed),
    ]) {
        try {
            return { ok: true, value: JSON.parse(candidate) };
        } catch {
            /* try next */
        }
    }
    return { ok: false };
}

function coerceArgValue(raw: string, stringHint?: string): unknown {
    const text = String(raw).trim();
    if (text === '') return '';
    if (stringHint === 'true') return text;
    const parsed = safeJsonParse(text);
    return parsed.ok ? parsed.value : text;
}

function parseInvokeArgs(body: string): Args {
    const args: Args = {};
    let sawParam = false;

    RE_PARAM.lastIndex = 0;
    let pm: RegExpExecArray | null;
    while ((pm = RE_PARAM.exec(body)) !== null) {
        sawParam = true;
        const attrs = parseAttrs(pm[1]);
        const paramName = attrs.name;
        if (paramName === undefined) continue;

        const raw = pm[2].trim();
        if (raw === '') continue;

        const value = coerceArgValue(raw, attrs.string);
        const key = paramName.toLowerCase();
        if ((key === 'arguments' || key === 'args') && isPlainObject(value)) {
            Object.assign(args, value);
        } else {
            args[paramName] = value;
        }
    }

    if (!sawParam) {
        // Some models emit raw JSON straight inside the invoke block.
        const parsed = safeJsonParse(body);
        if (parsed.ok && isPlainObject(parsed.value)) {
            Object.assign(args, parsed.value);
        } else {
            args.rawValue = body.trim();
        }
    }

    return args;
}

/**
 * @param text Raw message content containing DSML markup
 * @returns One entry per `invoke` block, or null when there is none
 */
export function parseDsmlToJson(text: string): DsmlToolCall[] | null {
    if (typeof text !== 'string' || !text) return null;

    RE_INVOKE.lastIndex = 0;
    const toolCalls: DsmlToolCall[] = [];
    let match: RegExpExecArray | null;

    while ((match = RE_INVOKE.exec(text)) !== null) {
        const name = (parseAttrs(match[1]).name ?? '').trim();
        if (name === '') continue;

        toolCalls.push({
            function: { name, arguments: JSON.stringify(parseInvokeArgs(match[2])) },
        });
    }

    return toolCalls.length > 0 ? toolCalls : null;
}

/** Removes DSML markup, keeping the surrounding prose. */
export function stripDsml(text: string): string {
    if (typeof text !== 'string' || !text) return '';
    return text
        .replace(RE_CONTAINER, '')
        .replace(RE_INVOKE_BLOCK, '')
        .replace(RE_PARAM_BLOCK, '')
        .replace(RE_TAG, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Convenience: tool calls plus the DSML-free remainder of the message. */
export function parseDsmlMessage(text: string): DsmlMessage {
    return { toolCalls: parseDsmlToJson(text), text: stripDsml(text) };
}

export function convertToDSML(dsml: string) {
    const response = parseDsmlMessage(dsml);

    const calls = response.toolCalls?.map(x => {
        return {
            function: x.function.name,
            arguments: JSON.parse(x.function.arguments)
        }
    })

    calls.push({
            function: 'Internal.speakToUser',
            arguments: {
                message: response.text
            } as any
        })
        return calls
}

// console.log((convertToDSML(`
// <｜｜DSML｜｜ calls>
// <｜｜DSML｜｜ invoke name="Cli.execute">
// <｜｜DSML｜｜ parameter name="arguments" string="false">{"command": "cd /tmp/sdktest && echo '### JSON type=sentinel -> gneol' && cat > s1.json <<'EOF'\n{\"resourceIds\":[\"__program__\",\"model_0\",\"sentinel_0\",\"sentinel_1\"],\"resources\":{\"__program__\":{\"type\":\"program\",\"data\":{\"name\":\"TX\",\"model\":\"m\"}},\"model_0\":{\"type\":\"model\",\"data\":{\"name\":\"m\",\"provider\":\"openrouter\",\"modelId\":\"x\",\"apiKey\":\"K\"}},\"sentinel_0\":{\"type\":\"sentinel\",\"data\":{\"name\":\"Marcus\",\"model\":\"m\",\"description\":\"spec\"}},\"sentinel_1\":{\"type\":\"sentinel\",\"data\":{\"name\":\"Nadia\",\"model\":\"m\"}}}}\nEOF\ngneol convert -f s1.json -t gneol -o s1.gneol 2>&1|tail -1; cat s1.gneol\necho '### JSON type=subagent -> gneol' && cat > s2.json <<'EOF'\n{\"resourceIds\":[\"__program__\",\"model_0\",\"subagent_0\"],\"resources\":{\"__program__\":{\"type\":\"program\",\"data\":{\"name\":\"TX\",\"model\":\"m\"}},\"model_0\":{\"type\":\"model\",\"data\":{\"name\":\"m\",\"provider\":\"openrouter\",\"modelId\":\"x\",\"apiKey\":\"K\"}},\"subagent_0\":{\"type\":\"subagent\",\"data\":{\"name\":\"Marcus\",\"model\":\"m\",\"description\":\"spec\"}}}}\nEOF\ngneol convert -f s2.json -t gneol -o s2.gneol 2>&1|tail -1; cat s2.gneol"}</｜｜DSML｜｜ parameter>
// <｜｜DSML｜｜ invoke>
// <｜｜DSML｜｜ invoke name="Cli.execute">
// <｜｜DSML｜｜ parameter name="arguments" string="false">
// `)))