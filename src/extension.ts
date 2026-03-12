import * as vscode from 'vscode';

// All IETF language tags supported by Xcode / Apple platforms
const LANGUAGE_CODES: { code: string; name: string }[] = [
    { code: 'ar',      name: 'Arabic' },
    { code: 'ar-AE',   name: 'Arabic (UAE)' },
    { code: 'ar-SA',   name: 'Arabic (Saudi Arabia)' },
    { code: 'ca',      name: 'Catalan' },
    { code: 'cs',      name: 'Czech' },
    { code: 'da',      name: 'Danish' },
    { code: 'de',      name: 'German' },
    { code: 'de-AT',   name: 'German (Austria)' },
    { code: 'de-CH',   name: 'German (Switzerland)' },
    { code: 'el',      name: 'Greek' },
    { code: 'en',      name: 'English' },
    { code: 'en-AU',   name: 'English (Australia)' },
    { code: 'en-CA',   name: 'English (Canada)' },
    { code: 'en-GB',   name: 'English (UK)' },
    { code: 'en-IN',   name: 'English (India)' },
    { code: 'en-US',   name: 'English (US)' },
    { code: 'es',      name: 'Spanish' },
    { code: 'es-419',  name: 'Spanish (Latin America)' },
    { code: 'es-MX',   name: 'Spanish (Mexico)' },
    { code: 'fi',      name: 'Finnish' },
    { code: 'fr',      name: 'French' },
    { code: 'fr-CA',   name: 'French (Canada)' },
    { code: 'fr-CH',   name: 'French (Switzerland)' },
    { code: 'he',      name: 'Hebrew' },
    { code: 'hi',      name: 'Hindi' },
    { code: 'hr',      name: 'Croatian' },
    { code: 'hu',      name: 'Hungarian' },
    { code: 'id',      name: 'Indonesian' },
    { code: 'it',      name: 'Italian' },
    { code: 'ja',      name: 'Japanese' },
    { code: 'ko',      name: 'Korean' },
    { code: 'ms',      name: 'Malay' },
    { code: 'nb',      name: 'Norwegian Bokmål' },
    { code: 'nl',      name: 'Dutch' },
    { code: 'pl',      name: 'Polish' },
    { code: 'pt',      name: 'Portuguese' },
    { code: 'pt-BR',   name: 'Portuguese (Brazil)' },
    { code: 'pt-PT',   name: 'Portuguese (Portugal)' },
    { code: 'ro',      name: 'Romanian' },
    { code: 'ru',      name: 'Russian' },
    { code: 'sk',      name: 'Slovak' },
    { code: 'sv',      name: 'Swedish' },
    { code: 'th',      name: 'Thai' },
    { code: 'tr',      name: 'Turkish' },
    { code: 'uk',      name: 'Ukrainian' },
    { code: 'vi',      name: 'Vietnamese' },
    { code: 'zh-Hans', name: 'Chinese (Simplified)' },
    { code: 'zh-Hant', name: 'Chinese (Traditional)' },
    { code: 'zh-HK',   name: 'Chinese (Hong Kong)' },
    { code: 'zh-TW',   name: 'Chinese (Taiwan)' },
];

export function activate(context: vscode.ExtensionContext) {

    // Scan the document for `"sourceLanguage" : "xx"` and return the code, or 'en' as fallback.
    function getSourceLanguage(document: vscode.TextDocument): string {
        for (let i = 0; i < Math.min(document.lineCount, 20); i++) {
            const m = document.lineAt(i).text.match(/"sourceLanguage"\s*:\s*"([^"]+)"/);
            if (m) { return m[1]; }
        }
        return 'en';
    }

    // Walk up from `fromLine` tracking brace depth to find the enclosing strings entry key.
    // The structure is:  "strings" : { "ENTRY_KEY" : { ... cursor ... } }
    // We need to find the key at depth 2 from the top-level object.
    // Returns the raw key string (without quotes), or null if not found.
    function getEntryKey(document: vscode.TextDocument, fromLine: number): string | null {
        let depth = 0;
        for (let i = fromLine; i >= 0; i--) {
            const t = document.lineAt(i).text;
            // Scan right-to-left to track brace depth
            for (let c = (i === fromLine ? t.length - 1 : t.length - 1); c >= 0; c--) {
                if (t[c] === '}') { depth++; }
                else if (t[c] === '{') {
                    depth--;
                    if (depth < 0) {
                        // We've exited a block — the key on this line (or previous) is the entry key
                        // Match a quoted key before the `{` on this line
                        const keyMatch = t.match(/^\s*"((?:[^"\\]|\\.)*)"\s*:\s*\{/);
                        if (keyMatch) { return keyMatch[1]; }
                        // Key might be on the previous line
                        if (i > 0) {
                            const prev = document.lineAt(i - 1).text;
                            const prevMatch = prev.match(/^\s*"((?:[^"\\]|\\.)*)"\s*:\s*\{?\s*$/);
                            if (prevMatch) { return prevMatch[1]; }
                        }
                        return null;
                    }
                }
            }
        }
        return null;
    }

    const provider = vscode.languages.registerCompletionItemProvider(
        'xcstrings',
        {
            provideCompletionItems(document, position) {
                const line        = document.lineAt(position).text;
                const linePrefix  = line.slice(0, position.character);
                const lineSuffix  = line.slice(position.character);

                // --- Find the previous non-empty line that needs a trailing comma ---
                // Returns a TextEdit to append `,` to that line, or null if not needed.
                function trailingCommaEdit(): vscode.TextEdit | null {
                    for (let i = position.line - 1; i >= 0; i--) {
                        const prevLine = document.lineAt(i);
                        const prev = prevLine.text.trimEnd();
                        if (prev.trim().length === 0) { continue; }
                        // Already has a comma, or opens a block → no edit needed
                        if (/[,{[]$/.test(prev)) { return null; }
                        // Ends with a value → append comma
                        if (/[}"'\d]$/.test(prev) || /\b(true|false)$/.test(prev)) {
                            const insertPos = new vscode.Position(i, prev.length);
                            return vscode.TextEdit.insert(insertPos, ',');
                        }
                        return null;
                    }
                    return null;
                }

                // --- Context detection ---
                // Key typed with opening quote:  `  "commen`
                const quoteMatch = linePrefix.match(/^(\s*)"([A-Za-z0-9][\w-]*)$/);
                // Key typed bare:                `  commen`
                const wordMatch  = linePrefix.match(/^(\s*)([A-Za-z][A-Za-z0-9-]*)$/);

                // Localization language key context:
                // We're inside a `"localizations" : {` block when the line looks like a bare key
                // and we can find `"localizations"` in the surrounding lines.
                function isInLocalizationsBlock(): boolean {
                    let depth = 0;
                    for (let i = position.line - 1; i >= 0; i--) {
                        const t = document.lineAt(i).text;
                        for (let c = t.length - 1; c >= 0; c--) {
                            if (t[c] === '}') { depth++; }
                            else if (t[c] === '{') {
                                if (depth === 0) {
                                    // This `{` opens our current block — check if the key before it is "localizations"
                                    return /"localizations"\s*:/.test(t) || /"localizations"\s*:/.test(document.lineAt(Math.max(0, i - 1)).text);
                                }
                                depth--;
                            }
                        }
                    }
                    return false;
                }

                // Value context
                const stateValueMatch      = linePrefix.match(/"state"\s*:\s*"([^"]*)$/);
                const extractionValueMatch = linePrefix.match(/"extractionState"\s*:\s*"([^"]*)$/);

                const items: vscode.CompletionItem[] = [];

                // --- Language code completions (inside localizations block) ---
                if ((quoteMatch || wordMatch) && isInLocalizationsBlock()) {
                    const hasQuote   = !!quoteMatch;
                    const typed      = hasQuote ? quoteMatch![2] : wordMatch![2];
                    const startChar  = position.character - typed.length - (hasQuote ? 1 : 0);
                    const endChar    = lineSuffix.startsWith('"') ? position.character + 1 : position.character;
                    const range      = new vscode.Range(position.with(undefined, startChar), position.with(undefined, endChar));
                    const commaEdit  = trailingCommaEdit();
                    const sourceLang = getSourceLanguage(document);

                    // Get the entry key to pre-fill the source language value
                    const entryKey   = getEntryKey(document, position.line);
                    // Escape snippet special chars: $, }, \
                    const entryValue = entryKey
                        ? entryKey.replace(/\\/g, '\\\\').replace(/\$/g, '\\$').replace(/}/g, '\\}')
                        : '';

                    // Source language entry first, always with state=translated, value pre-filled
                    const sourceLangInfo = LANGUAGE_CODES.find(l => l.code === sourceLang);
                    const sourceItem = new vscode.CompletionItem(`${sourceLang} ★`, vscode.CompletionItemKind.Value);
                    sourceItem.detail     = `${sourceLangInfo?.name ?? sourceLang} (source language)`;
                    sourceItem.filterText = sourceLang;
                    sourceItem.sortText   = '0';
                    sourceItem.range      = range;
                    sourceItem.insertText = new vscode.SnippetString(
                        `"${sourceLang}" : {\n\t"stringUnit" : {\n\t\t"state" : "translated",\n\t\t"value" : "\${1:${entryValue}}"\n\t}\n}`
                    );
                    if (commaEdit) { sourceItem.additionalTextEdits = [commaEdit]; }
                    items.push(sourceItem);

                    // All other languages — value empty tab stop
                    for (const lang of LANGUAGE_CODES) {
                        if (lang.code === sourceLang) { continue; }
                        const item = new vscode.CompletionItem(lang.code, vscode.CompletionItemKind.Value);
                        item.detail     = lang.name;
                        item.filterText = lang.code;
                        item.sortText   = `1${lang.code}`;
                        item.range      = range;
                        item.insertText = new vscode.SnippetString(
                            `"${lang.code}" : {\n\t"stringUnit" : {\n\t\t"state" : "\${1|translated,new,needs-review,untranslated|}",\n\t\t"value" : "$2"\n\t}\n}`
                        );
                        if (commaEdit) { item.additionalTextEdits = [commaEdit]; }
                        items.push(item);
                    }
                    return items;
                }

                // --- Key completions ---
                if (quoteMatch || wordMatch) {
                    const hasQuote   = !!quoteMatch;
                    const typed      = hasQuote ? quoteMatch![2] : wordMatch![2];
                    const startChar  = position.character - typed.length - (hasQuote ? 1 : 0);
                    const endChar    = lineSuffix.startsWith('"') ? position.character + 1 : position.character;
                    const range      = new vscode.Range(position.with(undefined, startChar), position.with(undefined, endChar));
                    const commaEdit  = trailingCommaEdit();
                    const sourceLang = getSourceLanguage(document);

                    // For localizations/strings snippets, try to pre-fill value from the entry key
                    const entryKey   = getEntryKey(document, position.line);
                    const entryValue = entryKey
                        ? entryKey.replace(/\\/g, '\\\\').replace(/\$/g, '\\$').replace(/}/g, '\\}')
                        : '';

                    const keyDefs = [
                        {
                            label: 'comment',
                            insert: '"comment" : "$1"',
                            detail: 'xcstrings: comment field'
                        },
                        {
                            label: 'extractionState',
                            insert: '"extractionState" : "${1|manual,automatic|}"',
                            detail: 'xcstrings: extractionState field'
                        },
                        {
                            label: 'isCommentAutoGenerated',
                            insert: '"isCommentAutoGenerated" : ${1|true,false|}',
                            detail: 'xcstrings: isCommentAutoGenerated field'
                        },
                        {
                            label: 'state',
                            insert: '"state" : "${1|translated,new,needs-review,untranslated|}"',
                            detail: 'xcstrings: state field'
                        },
                        {
                            label: 'value',
                            insert: '"value" : "$1"',
                            detail: 'xcstrings: value field'
                        },
                        {
                            label: 'stringUnit',
                            insert: '"stringUnit" : {\n\t"state" : "${1|translated,new,needs-review,untranslated|}",\n\t"value" : "$2"\n}',
                            detail: 'xcstrings: stringUnit block'
                        },
                        {
                            label: 'localizations',
                            insert: `"localizations" : {\n\t"${sourceLang}" : {\n\t\t"stringUnit" : {\n\t\t\t"state" : "translated",\n\t\t\t"value" : "\${1:${entryValue}}"\n\t\t}\n\t}\n}`,
                            detail: `xcstrings: localizations block (source: ${sourceLang})`
                        },
                        {
                            label: 'sourceLanguage',
                            insert: '"sourceLanguage" : "${1:en}"',
                            detail: 'xcstrings: sourceLanguage field'
                        },
                        {
                            label: 'strings',
                            insert: `"strings" : {\n\t"\${1:key}" : {\n\t\t"comment" : "$2",\n\t\t"localizations" : {\n\t\t\t"${sourceLang}" : {\n\t\t\t\t"stringUnit" : {\n\t\t\t\t\t"state" : "translated",\n\t\t\t\t\t"value" : "$3"\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n}`,
                            detail: `xcstrings: strings block (source: ${sourceLang})`
                        },
                    ];

                    for (const def of keyDefs) {
                        const item = new vscode.CompletionItem(def.label, vscode.CompletionItemKind.Property);
                        item.insertText = new vscode.SnippetString(def.insert);
                        item.filterText = def.label;
                        item.range      = range;
                        item.detail     = def.detail;
                        if (commaEdit) { item.additionalTextEdits = [commaEdit]; }
                        items.push(item);
                    }

                    return items;
                }

                // --- Value completions for "state" ---
                if (stateValueMatch) {
                    const typed     = stateValueMatch[1];
                    const startChar = position.character - typed.length;
                    const endChar   = lineSuffix.startsWith('"') ? position.character + 1 : position.character;
                    const range     = new vscode.Range(position.with(undefined, startChar), position.with(undefined, endChar));
                    for (const s of ['translated', 'new', 'needs-review', 'untranslated']) {
                        const item = new vscode.CompletionItem(s, vscode.CompletionItemKind.EnumMember);
                        item.insertText = `${s}"`;
                        item.filterText = s;
                        item.range      = range;
                        item.detail     = `xcstrings state: ${s}`;
                        items.push(item);
                    }
                    return items;
                }

                // --- Value completions for "extractionState" ---
                if (extractionValueMatch) {
                    const typed     = extractionValueMatch[1];
                    const startChar = position.character - typed.length;
                    const endChar   = lineSuffix.startsWith('"') ? position.character + 1 : position.character;
                    const range     = new vscode.Range(position.with(undefined, startChar), position.with(undefined, endChar));
                    for (const v of ['manual', 'automatic']) {
                        const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.EnumMember);
                        item.insertText = `${v}"`;
                        item.filterText = v;
                        item.range      = range;
                        item.detail     = `xcstrings extractionState: ${v}`;
                        items.push(item);
                    }
                    return items;
                }

                return items;
            }
        },
        'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
        'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
        '-'
    );

    context.subscriptions.push(provider);
}
