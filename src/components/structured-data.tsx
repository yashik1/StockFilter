import type { JsonLd } from "@/lib/structured-data";

/**
 * Renders JSON-LD into the document.
 *
 * `JSON.stringify` is the whole sanitisation story here: the values are
 * filing-derived strings, and stringify escapes the quotes and backslashes
 * that could otherwise close the script tag early. The one sequence it does
 * not escape is `</script`, so that is handled explicitly — a company whose
 * name contained it would otherwise break every page it appeared on.
 */
export function StructuredData({ data }: { data: JsonLd | JsonLd[] }) {
  const json = JSON.stringify(data).replace(/<\/(script)/gi, "<\/$1");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
