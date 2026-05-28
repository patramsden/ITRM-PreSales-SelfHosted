/**
 * RichTextEditor — drop-in replacement for <textarea> fields that need formatting.
 *
 * Built on TipTap (ProseMirror) with a clean toolbar matching the app's design.
 * When `disabled` is true renders a read-only HTML view with no toolbar.
 *
 * Value contract:
 *   - Accepts existing plain-text content gracefully (renders as-is).
 *   - Outputs HTML strings.  Persist the HTML; display it with the companion
 *     <RichContent> component when you only need to render (no edit).
 *
 * Usage:
 *   import { RichTextEditor, RichContent } from '../ui/RichTextEditor';
 *
 *   // Editable
 *   <RichTextEditor value={html} onChange={setHtml} placeholder="Type here…" />
 *
 *   // Read-only display
 *   <RichContent html={html} />
 *
 * Props:
 *   value       HTML string (or legacy plain-text — both are handled).
 *   onChange    Called with new HTML on every change.
 *   disabled    Hides toolbar, prevents editing.
 *   placeholder Ghost text shown in empty editor.
 *   minHeight   Minimum editor height (default "10rem").
 *   minimal     Omit headings and link tools — for short narrative fields.
 *   className   Extra classes applied to the outer wrapper.
 */

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit                   from '@tiptap/starter-kit';
import Underline                    from '@tiptap/extension-underline';
import Link                         from '@tiptap/extension-link';
import Placeholder                  from '@tiptap/extension-placeholder';
import TextAlign                    from '@tiptap/extension-text-align';
import { useEffect, useCallback }   from 'react';
import clsx                         from 'clsx';
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Heading1, Heading2, Heading3, Link2, Link2Off,
  AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, RemoveFormatting,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Detect whether a string looks like HTML (starts with a tag). */
function isHtml(s: string): boolean {
  return /^\s*</.test(s);
}

/** Wrap plain text in a paragraph so TipTap treats it correctly. */
function normalise(raw: string): string {
  if (!raw) return '';
  if (isHtml(raw)) return raw;
  // Convert plain text to basic HTML: newlines → <br>
  return '<p>' + raw.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
}

// ─── Toolbar button ───────────────────────────────────────────────────────────

function ToolBtn({
  onClick, active, title, children, disabled,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick(); }}   // prevent editor blur
      title={title}
      disabled={disabled}
      className={clsx(
        'p-1.5 rounded transition-colors select-none',
        active
          ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300'
          : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-800 dark:hover:text-slate-200',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-gray-200 dark:bg-slate-600 mx-0.5" />;
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function Toolbar({ editor, minimal }: { editor: ReturnType<typeof useEditor>; minimal?: boolean }) {
  if (!editor) return null;

  const addLink = () => {
    const url = window.prompt('URL:');
    if (url) editor.chain().focus().setLink({ href: url, target: '_blank' }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/60 rounded-t-lg">
      {/* History */}
      <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="Undo (Ctrl+Z)" disabled={!editor.can().undo()}>
        <Undo2 size={13} />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="Redo (Ctrl+Y)" disabled={!editor.can().redo()}>
        <Redo2 size={13} />
      </ToolBtn>

      <Divider />

      {/* Headings — only in full mode */}
      {!minimal && (
        <>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1">
            <Heading1 size={13} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
            <Heading2 size={13} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">
            <Heading3 size={13} />
          </ToolBtn>
          <Divider />
        </>
      )}

      {/* Inline formatting */}
      <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold (Ctrl+B)">
        <Bold size={13} />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic (Ctrl+I)">
        <Italic size={13} />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline (Ctrl+U)">
        <UnderlineIcon size={13} />
      </ToolBtn>

      <Divider />

      {/* Lists */}
      <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
        <List size={13} />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">
        <ListOrdered size={13} />
      </ToolBtn>

      {/* Alignment — only in full mode */}
      {!minimal && (
        <>
          <Divider />
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align left">
            <AlignLeft size={13} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align centre">
            <AlignCenter size={13} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align right">
            <AlignRight size={13} />
          </ToolBtn>
        </>
      )}

      <Divider />

      {/* Link — only in full mode */}
      {!minimal && (
        <>
          <ToolBtn onClick={addLink} active={editor.isActive('link')} title="Insert link">
            <Link2 size={13} />
          </ToolBtn>
          {editor.isActive('link') && (
            <ToolBtn onClick={() => editor.chain().focus().unsetLink().run()} title="Remove link">
              <Link2Off size={13} />
            </ToolBtn>
          )}
          <Divider />
        </>
      )}

      {/* Clear formatting */}
      <ToolBtn onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="Clear formatting">
        <RemoveFormatting size={13} />
      </ToolBtn>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface RichTextEditorProps {
  value:       string;
  onChange:    (html: string) => void;
  disabled?:   boolean;
  placeholder?: string;
  minHeight?:  string;
  /** Omit headings, links and alignment — for short narrative fields. */
  minimal?:    boolean;
  className?:  string;
}

export function RichTextEditor({
  value, onChange, disabled, placeholder, minHeight = '10rem', minimal, className,
}: RichTextEditorProps) {

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable the heading extension if minimal mode (we add it back below unless minimal)
        heading: minimal ? false : { levels: [1, 2, 3] },
        bulletList:   { keepMarks: true },
        orderedList:  { keepMarks: true },
        code:         false,
        codeBlock:    false,
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: placeholder ?? 'Start typing…' }),
      ...(!minimal ? [TextAlign.configure({ types: ['heading', 'paragraph'] })] : []),
    ],
    content: normalise(value),
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // Treat empty editor as empty string
      onChange(html === '<p></p>' ? '' : html);
    },
  });

  // Sync external value changes (e.g. AI generation overwrites content)
  const prevValue = value;
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = normalise(value);
    if (incoming !== current && value !== prevValue) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Sync editable state
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  if (disabled) {
    // Read-only: just render the HTML, no editor overhead
    return (
      <div
        className={clsx(
          'prose prose-sm dark:prose-invert max-w-none px-3 py-2 text-sm text-gray-700 dark:text-slate-300 leading-relaxed',
          className,
        )}
        dangerouslySetInnerHTML={{ __html: normalise(value) || `<span class="text-gray-400 italic">${placeholder ?? '—'}</span>` }}
      />
    );
  }

  return (
    <div className={clsx(
      'border border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden',
      'focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-400',
      className,
    )}>
      <Toolbar editor={editor} minimal={minimal} />
      <EditorContent
        editor={editor}
        className={clsx(
          'rich-editor bg-white dark:bg-slate-700 px-3 py-2',
          '[&_.ProseMirror]:outline-none',
          '[&_.ProseMirror]:text-sm',
          '[&_.ProseMirror]:text-gray-900',
          '[&_.ProseMirror]:dark:text-slate-100',
          '[&_.ProseMirror]:leading-relaxed',
          '[&_.ProseMirror]:min-h-[var(--rte-min-h)]',
          // Headings
          '[&_.ProseMirror_h1]:text-xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:mt-4 [&_.ProseMirror_h1]:mb-2',
          '[&_.ProseMirror_h2]:text-lg  [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:mt-3 [&_.ProseMirror_h2]:mb-1.5',
          '[&_.ProseMirror_h3]:text-base [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:mt-2 [&_.ProseMirror_h3]:mb-1',
          // Paragraphs + spacing
          '[&_.ProseMirror_p]:my-1.5',
          // Lists
          '[&_.ProseMirror_ul]:list-disc  [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ul]:my-1.5',
          '[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_ol]:my-1.5',
          '[&_.ProseMirror_li]:my-0.5',
          // Links
          '[&_.ProseMirror_a]:text-brand-600 [&_.ProseMirror_a]:underline',
          // Placeholder
          '[&_.ProseMirror_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
          '[&_.ProseMirror_.is-editor-empty:first-child::before]:text-gray-400',
          '[&_.ProseMirror_.is-editor-empty:first-child::before]:dark:text-slate-500',
          '[&_.ProseMirror_.is-editor-empty:first-child::before]:float-left',
          '[&_.ProseMirror_.is-editor-empty:first-child::before]:pointer-events-none',
          '[&_.ProseMirror_.is-editor-empty:first-child::before]:h-0',
        )}
        style={{ '--rte-min-h': minHeight } as React.CSSProperties}
      />
    </div>
  );
}

// ─── Read-only HTML renderer ──────────────────────────────────────────────────

/**
 * Renders stored HTML (or legacy plain text) for display-only contexts.
 * Does NOT mount the full TipTap editor — zero overhead.
 */
export function RichContent({
  html, className, fallback = '—',
}: {
  html:      string | undefined;
  className?: string;
  fallback?:  string;
}) {
  if (!html?.trim()) {
    return <span className={clsx('text-gray-400 dark:text-slate-500 italic text-sm', className)}>{fallback}</span>;
  }
  return (
    <div
      className={clsx(
        'prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed',
        'prose-headings:font-bold prose-a:text-brand-600',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: normalise(html) }}
    />
  );
}

// ─── HTML → plain text helper (for PDF generation) ───────────────────────────

/**
 * Strips HTML tags and converts formatted content to readable plain text.
 * Preserves paragraphs, headings and list items as newline-separated text.
 * Used by PDF generators that need plain strings.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return '';
  if (!isHtml(html)) return html;

  return html
    // Block elements → newlines
    .replace(/<\/?(h[1-3]|p|li|br|div|blockquote)[^>]*>/gi, (tag) => {
      if (tag.startsWith('</') || /^<br/i.test(tag)) return '\n';
      return '\n';
    })
    // List items get a bullet
    .replace(/<li[^>]*>/gi, '\n• ')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode common entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    // Collapse excess blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
