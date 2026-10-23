import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { VideoLink } from './VideoPlayer.jsx';

// Agent replies use single newlines as line breaks, so keep them (remark-breaks).
const PLUGINS = [remarkGfm, remarkBreaks];

const COMPONENTS = {
  a: ({ href, title, children }) => <VideoLink href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</VideoLink>,
  table: ({ children }) => <div className="table-wrap"><table className="data-table">{children}</table></div>,
};

/** Renders LLM / agent Markdown replies. Raw HTML is not rendered (react-markdown default). */
export default function Markdown({ text, className = '' }) {
  if (!text) return null;
  return (
    <div className={`markdown${className ? ` ${className}` : ''}`}>
      <ReactMarkdown remarkPlugins={PLUGINS} components={COMPONENTS}>{String(text)}</ReactMarkdown>
    </div>
  );
}
