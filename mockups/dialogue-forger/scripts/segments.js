/**
 * Text ⇄ dialogue segments.
 *
 * A line's `text` is a list of segments in the file format, but writing a list
 * of objects by hand is tedious. Instead the editor exposes one textarea with a
 * tiny inline syntax, and this module converts between the two.
 *
 * Syntax (everything is a `{...}` directive; anything else is plain text):
 *
 *   {pause:400}                       a hold, in milliseconds
 *   {click id|label|next_node}        clickable text, optional to click
 *   {click! id|label|next_node}       clickable text, required to click
 *   {style bold color=#D88CFF|text}   styled text
 *   {style wave=normal|text}          text that ripples, letter by letter
 *   {style jitter=normal|text}        text that trembles, as if about to cry
 *
 * Styled text accepts `bold`, `italic`, `underline` as bare flags and
 * `color=`, `speed=`, `shake=`, `wave=`, `jitter=`, `<estilo>_speed=`, `pause=`
 * as values.
 *
 * A level says **how far** a movement travels and a speed says **how fast**, so
 * the two are independent. `shake` (side to side), `wave` (up and down, one
 * letter at a time) and `jitter` (a small, jerky tremble) take a level — `off`,
 * `light`, `normal` or `strong` — and `shake_speed`, `wave_speed` and
 * `jitter_speed` take a multiplier in which `1` is the default tempo, below 1 is
 * slower and above 1 is faster (the same convention as `speed=`).
 * `wave=light wave_speed=2` is therefore a small, quick ripple.
 *
 * The three movements are **layered**, not exclusive: a segment may ask for
 * `shake=normal jitter=light` and both run at once, because the shake moves the
 * whole segment while the jitter trembles in place inside it. Each keeps its own
 * speed, so a segment can drift slowly while it trembles quickly.
 *
 * A literal `{` is written `\{`. Unknown braces are left alone, so ordinary
 * prose containing braces is never mangled.
 */
(function (Forger) {
    'use strict';

    var STYLE_FLAGS = ['bold', 'italic', 'underline'];
    var STYLE_KEYS = ['color', 'speed', 'shake', 'wave', 'jitter', 'pause'];

    /**
     * The keys that change a movement's tempo rather than its reach.
     *
     * Kept apart from `STYLE_KEYS` because they are the only numeric style keys
     * that have to be validated: a level the game does not know is read as "still",
     * but a multiplier of zero or less would freeze — or reverse — a loop that
     * never ends, and no amount of previewing would explain why.
     */
    var STYLE_SPEED_KEYS = ['shake_speed', 'wave_speed', 'jitter_speed'];

    /**
     * The only levels a movement style accepts.
     *
     * Checked here rather than left to the game because the game reads an
     * unknown level as "still": a typo would look like a style that simply does
     * not work, which is the hardest kind of bug to find from the preview.
     */
    var STYLE_LEVELS = ['off', 'light', 'normal', 'strong'];

    /** Parses editor text into segments, collecting anything malformed. */
    function parse(text) {
        var segments = [];
        var errors = [];
        var buffer = '';
        var index = 0;

        function flushText() {
            if (buffer.length > 0) {
                segments.push({ type: 'text', value: buffer });
                buffer = '';
            }
        }

        while (index < text.length) {
            var character = text.charAt(index);

            // An escaped brace is a literal brace.
            if (character === '\\' && text.charAt(index + 1) === '{') {
                buffer += '{';
                index += 2;
                continue;
            }

            if (character !== '{') {
                buffer += character;
                index += 1;
                continue;
            }

            var close = text.indexOf('}', index + 1);

            if (close === -1) {
                buffer += character;
                index += 1;
                continue;
            }

            var body = text.slice(index + 1, close);
            var directive = parseDirective(body);

            // Not a directive we know: treat the brace as ordinary text.
            if (!directive) {
                buffer += character;
                index += 1;
                continue;
            }

            if (directive.error) {
                errors.push({ message: directive.error, raw: '{' + body + '}' });
                buffer += '{' + body + '}';
                index = close + 1;
                continue;
            }

            flushText();
            segments.push(directive.segment);
            index = close + 1;
        }

        flushText();
        return { segments: segments, errors: errors };
    }

    /** Renders segments back into editor text, so a file can be re-opened. */
    function format(segments) {
        return (segments || []).map(formatSegment).join('');
    }

    /** Turns one directive body into a segment, or reports why it cannot. */
    function parseDirective(body) {
        if (/^pause\s*:/.test(body)) {
            var milliseconds = Number(body.slice(body.indexOf(':') + 1).trim());

            if (!isFinite(milliseconds) || milliseconds < 0) {
                return { error: 'A pausa precisa de um número de milissegundos, ex.: {pause:400}.' };
            }

            return { segment: { type: 'pause', duration_ms: milliseconds } };
        }

        if (/^click!?(\s|$)/.test(body)) {
            var required = body.charAt(5) === '!';
            var rest = body.slice(required ? 6 : 5).trim();
            var parts = rest.split('|').map(trim);

            if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
                return { error: 'O texto clicável precisa de "{click id|rótulo|nó_destino}".' };
            }

            return {
                segment: {
                    type: 'interactive_text',
                    interaction_id: parts[0],
                    value: parts[1],
                    optional: !required,
                    on_click: { next: parts[2] },
                },
            };
        }

        if (/^style\s/.test(body)) {
            var pipe = body.indexOf('|');

            if (pipe === -1) {
                return { error: 'O texto com estilo precisa de "{style bold color=#fff|texto}".' };
            }

            var tokens = body.slice(6, pipe).trim().split(/\s+/).filter(Boolean);
            var style = {};

            for (var i = 0; i < tokens.length; i += 1) {
                var token = tokens[i];
                var equals = token.indexOf('=');

                if (equals === -1) {
                    if (STYLE_FLAGS.indexOf(token) === -1) {
                        return { error: 'Estilo de texto desconhecido: "' + token + '".' };
                    }

                    style[token] = true;
                    continue;
                }

                var key = token.slice(0, equals);
                var rawValue = token.slice(equals + 1);

                if (STYLE_KEYS.indexOf(key) === -1 && STYLE_SPEED_KEYS.indexOf(key) === -1) {
                    return { error: 'Estilo de texto desconhecido: "' + key + '".' };
                }

                if (key === 'color') {
                    style.color = rawValue;
                } else if (key === 'speed') {
                    style.speed_multiplier = Number(rawValue);
                } else if (STYLE_SPEED_KEYS.indexOf(key) !== -1) {
                    var multiplier = Number(rawValue);

                    // A `speed` that cannot be read is silently ignored by the
                    // game, but a *movement* multiplier of zero or less would
                    // divide a duration into infinity. Refused here, where the
                    // writer is looking, instead of frozen on screen later.
                    if (!isFinite(multiplier) || multiplier <= 0) {
                        return {
                            error: '"' + key + '" precisa de um número maior que 0: '
                                + 'abaixo de 1 é mais lento, acima de 1 é mais rápido.',
                        };
                    }

                    style[key] = multiplier;
                } else if (key === 'shake' || key === 'wave' || key === 'jitter') {
                    if (STYLE_LEVELS.indexOf(rawValue) === -1) {
                        return {
                            error: 'Nível de "' + key + '" desconhecido: "' + rawValue
                                + '". Use ' + STYLE_LEVELS.join(', ') + '.',
                        };
                    }

                    style[key] = rawValue;
                } else {
                    style.pause_after_ms = Number(rawValue);
                }
            }

            return {
                segment: {
                    type: 'styled_text',
                    value: body.slice(pipe + 1),
                    style: style,
                },
            };
        }

        return null;
    }

    /** Renders one segment as editor text. */
    function formatSegment(segment) {
        switch (segment.type) {
            case 'text':
                return escapeBraces(segment.value || '');

            case 'pause':
                return '{pause:' + (segment.duration_ms == null ? 400 : segment.duration_ms) + '}';

            case 'interactive_text':
                return '{click'
                    + (segment.optional === false ? '!' : '')
                    + ' ' + segment.interaction_id
                    + '|' + (segment.value || '')
                    + '|' + ((segment.on_click && segment.on_click.next) || '')
                    + '}';

            case 'styled_text':
                return '{style ' + formatStyle(segment.style) + '|' + escapeBraces(segment.value || '') + '}';

            default:
                return '';
        }
    }

    /** Renders a style object back into directive tokens. */
    function formatStyle(style) {
        var source = style || {};
        var tokens = [];

        if (source.bold) tokens.push('bold');
        if (source.italic) tokens.push('italic');
        if (source.underline) tokens.push('underline');
        if (source.color) tokens.push('color=' + source.color);
        if (source.speed_multiplier != null) tokens.push('speed=' + source.speed_multiplier);
        if (source.shake) tokens.push('shake=' + source.shake);
        if (source.shake_speed != null) tokens.push('shake_speed=' + source.shake_speed);
        if (source.wave) tokens.push('wave=' + source.wave);
        if (source.wave_speed != null) tokens.push('wave_speed=' + source.wave_speed);
        if (source.jitter) tokens.push('jitter=' + source.jitter);
        if (source.jitter_speed != null) tokens.push('jitter_speed=' + source.jitter_speed);
        if (source.pause_after_ms != null) tokens.push('pause=' + source.pause_after_ms);

        return tokens.join(' ');
    }

    /** Only `{` needs escaping, because that is all the parser reacts to. */
    function escapeBraces(value) {
        return String(value).replace(/\{/g, '\\{');
    }

    function trim(value) {
        return value.trim();
    }

    Forger.segments = {
        parse: parse,
        format: format,
    };
})(window.DialogueForger);
