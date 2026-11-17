import { useMemo } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import type { Grounding } from "../firebase/research";

// The grounded cloud review screen.
//
// Everything on it comes back from the model, so the Markdown is parsed and
// then sanitised before it reaches the DOM. The suggestions widget is the one
// exception that must stay raw HTML: Google's grounding terms require it to be
// rendered as returned, which is why it goes into a sandboxed iframe instead of
// into the page.

export interface ResearchScreenProps {
  markdown: string;
  grounding: Grounding;
  onDraft?: () => void;
  onBack?: () => void;
}

export function ResearchScreen({ markdown, grounding, onDraft, onBack }: ResearchScreenProps) {
  const analysis = useMemo(
    () => DOMPurify.sanitize(marked.parse(markdown, { async: false })),
    [markdown],
  );

  return (
    <section className="research">
      <div className="bar">
        <h2>Grounded cloud research</h2>
        <div>
          {onDraft && <button onClick={onDraft}>Draft a message from this</button>}
          {onBack && <button onClick={onBack}>Back</button>}
        </div>
      </div>

      <article className="analysis" dangerouslySetInnerHTML={{ __html: analysis }} />

      {grounding.searchSuggestionsHtml && (
        <iframe
          title="Google Search suggestions"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={grounding.searchSuggestionsHtml}
        />
      )}

      <h3>Web sources</h3>
      {grounding.sources.length === 0 ? (
        <p className="hint">No web sources were returned for this answer.</p>
      ) : (
        <ul>
          {grounding.sources.map((source) => (
            <li key={source.uri}>
              <a href={source.uri} rel="noopener noreferrer" target="_blank">
                {source.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default ResearchScreen;
