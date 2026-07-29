import React from "react";
import { parseJobDescription } from "@/shared/utils/format-job-description";

/**
 * React Component to render parsed job description blocks beautifully formatted.
 */
export function FormattedJobDescription({
  text,
  className = "",
}: {
  text?: string;
  className?: string;
}) {
  const blocks = parseJobDescription(text);

  if (!blocks.length) {
    return (
      <p className="text-sm text-neutral-500 dark:text-text-tertiary">
        No durable description is stored for this vacancy. Open the source advert for the complete text.
      </p>
    );
  }

  return (
    <div className={`space-y-4 text-sm leading-relaxed text-neutral-700 dark:text-text-secondary ${className}`}>
      {blocks.map((block, idx) => {
        if (block.type === "heading") {
          return (
            <h3
              key={idx}
              className="mt-5 mb-2 text-base font-bold tracking-tight text-neutral-900 dark:text-text-primary first:mt-0"
            >
              {block.content}
            </h3>
          );
        }

        if (block.type === "list" && block.items?.length) {
          return (
            <ul key={idx} className="my-2.5 space-y-1.5 pl-4 list-disc marker:text-accent-purple">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="leading-normal">
                  {item}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={idx} className="my-2 whitespace-pre-line leading-relaxed">
            {block.content}
          </p>
        );
      })}
    </div>
  );
}
