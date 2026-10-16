import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  Bold, 
  Underline, 
  Strikethrough, 
  Highlighter, 
  Heading1, 
  Heading2, 
  List, 
  Sparkles,
  ListOrdered
} from 'lucide-react';

interface HybridNotesEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const HybridNotesEditor: React.FC<HybridNotesEditorProps> = ({
  value,
  onChange,
  placeholder = "Escreva notas ou observações sobre esta tarefa... (# título, *negrito*, ::destaque::)"
}) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isBubbleVisible, setIsBubbleVisible] = useState(false);
  const [bubblePos, setBubblePos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const isInternalUpdate = useRef(false);

  // Inicializar conteúdo do editor
  useEffect(() => {
    if (!editorRef.current) return;
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }

    const currentHtml = editorRef.current.innerHTML;
    if (value !== currentHtml) {
      if (!value) {
        editorRef.current.innerHTML = '';
      } else if (value.includes('<') && value.includes('>')) {
        editorRef.current.innerHTML = value;
      } else {
        // Converter quebras de linha em parágrafos se for texto simples
        editorRef.current.innerHTML = value
          .split('\n')
          .map((line) => (line.trim() ? `<p>${line}</p>` : '<p><br></p>'))
          .join('');
      }
    }
  }, [value]);

  const notifyChange = useCallback(() => {
    if (!editorRef.current) return;
    isInternalUpdate.current = true;
    const html = editorRef.current.innerHTML;
    // Se só tiver <p><br></p> ou vazio
    if (html === '<p><br></p>' || html === '<br>' || !html.trim()) {
      onChange('');
    } else {
      onChange(html);
    }
  }, [onChange]);

  // Verificar e posicionar o Bubble Menu flutuante
  const updateBubbleMenu = useCallback(() => {
    const sel = window.getSelection();
    if (
      sel &&
      !sel.isCollapsed &&
      editorRef.current &&
      containerRef.current &&
      editorRef.current.contains(sel.anchorNode)
    ) {
      const text = sel.toString().trim();
      if (!text) {
        setIsBubbleVisible(false);
        return;
      }

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();

      const top = rect.top - containerRect.top - 46;
      const left = rect.left - containerRect.left + rect.width / 2;

      setBubblePos({
        top: Math.max(0, top),
        left: Math.max(80, Math.min(containerRect.width - 120, left)),
      });
      setIsBubbleVisible(true);
    } else {
      setIsBubbleVisible(false);
    }
  }, []);

  // Atalhos de teclado e Live Markdown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // 1. Atalho Ctrl+Shift+X para tachado (strikethrough)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'x' || e.key === 'X')) {
      e.preventDefault();
      document.execCommand('strikeThrough', false);
      notifyChange();
      return;
    }

    // 2. Live Markdown no pressionar de espaço
    if (e.key === ' ') {
      const sel = window.getSelection();
      if (!sel || !sel.isCollapsed || !sel.anchorNode) return;

      const node = sel.anchorNode;
      const text = node.textContent || '';
      const offset = sel.anchorOffset;
      const textBefore = text.slice(0, offset);

      // # Título H1
      if (textBefore === '#') {
        e.preventDefault();
        node.textContent = text.slice(offset);
        document.execCommand('formatBlock', false, '<h1>');
        notifyChange();
        return;
      }

      // ## Título H2
      if (textBefore === '##') {
        e.preventDefault();
        node.textContent = text.slice(offset);
        document.execCommand('formatBlock', false, '<h2>');
        notifyChange();
        return;
      }

      // ### Título H3
      if (textBefore === '###') {
        e.preventDefault();
        node.textContent = text.slice(offset);
        document.execCommand('formatBlock', false, '<h3>');
        notifyChange();
        return;
      }

      // - ou * Lista com marcadores
      if (textBefore === '-' || textBefore === '*') {
        e.preventDefault();
        node.textContent = text.slice(offset);
        document.execCommand('insertUnorderedList', false);
        notifyChange();
        return;
      }

      // 1. Lista numerada
      if (textBefore === '1.') {
        e.preventDefault();
        node.textContent = text.slice(offset);
        document.execCommand('insertOrderedList', false);
        notifyChange();
        return;
      }
    }
  };

  // Conversão de sintaxe inline (*texto*, _texto_, ::texto::) no evento onInput
  const handleInput = () => {
    notifyChange();

    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed || !sel.anchorNode) return;

    const node = sel.anchorNode;
    if (node.nodeType !== Node.TEXT_NODE) return;

    const text = node.textContent || '';

    // Highlight: ::texto::
    const highlightMatch = text.match(/::([^:]+)::/);
    if (highlightMatch && highlightMatch.index !== undefined) {
      const fullMatch = highlightMatch[0];
      const innerText = highlightMatch[1];
      const matchIndex = highlightMatch.index;

      const range = document.createRange();
      range.setStart(node, matchIndex);
      range.setEnd(node, matchIndex + fullMatch.length);

      sel.removeAllRanges();
      sel.addRange(range);

      const mark = document.createElement('mark');
      mark.className = 'notes-highlight';
      mark.textContent = innerText;

      range.deleteContents();
      range.insertNode(mark);

      // Colocar cursor logo após a marcação
      range.setStartAfter(mark);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);

      notifyChange();
      return;
    }

    // Negrito: *texto*
    const boldMatch = text.match(/(?<!\*)\*([^*\s][^*]*[^*\s]|[^*\s])\*/);
    if (boldMatch && boldMatch.index !== undefined) {
      const fullMatch = boldMatch[0];
      const innerText = boldMatch[1];
      const matchIndex = boldMatch.index;

      const range = document.createRange();
      range.setStart(node, matchIndex);
      range.setEnd(node, matchIndex + fullMatch.length);

      sel.removeAllRanges();
      sel.addRange(range);

      const strong = document.createElement('strong');
      strong.textContent = innerText;

      range.deleteContents();
      range.insertNode(strong);

      range.setStartAfter(strong);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);

      notifyChange();
      return;
    }

    // Sublinhado: _texto_
    const underlineMatch = text.match(/(?<!_)_([^_\s][^_]*[^_\s]|[^_\s])_/);
    if (underlineMatch && underlineMatch.index !== undefined) {
      const fullMatch = underlineMatch[0];
      const innerText = underlineMatch[1];
      const matchIndex = underlineMatch.index;

      const range = document.createRange();
      range.setStart(node, matchIndex);
      range.setEnd(node, matchIndex + fullMatch.length);

      sel.removeAllRanges();
      sel.addRange(range);

      const u = document.createElement('u');
      u.textContent = innerText;

      range.deleteContents();
      range.insertNode(u);

      range.setStartAfter(u);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);

      notifyChange();
      return;
    }
  };

  // Funções do Bubble Menu Flutuante
  const applyCommand = (command: string, arg: string | undefined = undefined) => {
    document.execCommand(command, false, arg);
    notifyChange();
    updateBubbleMenu();
  };

  const applyHighlight = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const selectedText = range.extractContents();

    const mark = document.createElement('mark');
    mark.className = 'notes-highlight';
    mark.appendChild(selectedText);

    range.insertNode(mark);
    notifyChange();
    setIsBubbleVisible(false);
  };

  return (
    <div className="hybrid-notes-container" ref={containerRef}>
      {/* Barra de Ferramentas Flutuante (Bubble Menu) estilo Notion/TickTick */}
      {isBubbleVisible && (
        <div
          className="bubble-toolbar"
          style={{ top: `${bubblePos.top}px`, left: `${bubblePos.left}px` }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            type="button"
            className="bubble-btn"
            onClick={() => applyCommand('bold')}
            title="Negrito (Ctrl+B ou *texto*)"
          >
            <Bold size={13} />
          </button>
          <button
            type="button"
            className="bubble-btn"
            onClick={() => applyCommand('underline')}
            title="Sublinhado (Ctrl+U ou _texto_)"
          >
            <Underline size={13} />
          </button>
          <button
            type="button"
            className="bubble-btn"
            onClick={() => applyCommand('strikeThrough')}
            title="Riscado (Ctrl+Shift+X)"
          >
            <Strikethrough size={13} />
          </button>
          <button
            type="button"
            className="bubble-btn highlight-btn"
            onClick={applyHighlight}
            title="Marca-texto (::destaque::)"
          >
            <Highlighter size={13} />
          </button>
          <div className="bubble-separator" />
          <button
            type="button"
            className="bubble-btn"
            onClick={() => applyCommand('formatBlock', '<h1>')}
            title="Título H1 (# espaço)"
          >
            <Heading1 size={13} />
          </button>
          <button
            type="button"
            className="bubble-btn"
            onClick={() => applyCommand('formatBlock', '<h2>')}
            title="Título H2 (## espaço)"
          >
            <Heading2 size={13} />
          </button>
          <button
            type="button"
            className="bubble-btn"
            onClick={() => applyCommand('insertUnorderedList')}
            title="Lista com marcadores (- espaço)"
          >
            <List size={13} />
          </button>
          <button
            type="button"
            className="bubble-btn"
            onClick={() => applyCommand('insertOrderedList')}
            title="Lista numerada (1. espaço)"
          >
            <ListOrdered size={13} />
          </button>
        </div>
      )}

      {/* Editor ContentEditable com Auto-expansão */}
      <div
        ref={editorRef}
        className="hybrid-notes-editor"
        contentEditable
        data-placeholder={placeholder}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        onKeyUp={updateBubbleMenu}
        onMouseUp={updateBubbleMenu}
        onBlur={() => {
          notifyChange();
          setTimeout(() => setIsBubbleVisible(false), 200);
        }}
        spellCheck
      />
    </div>
  );
};
