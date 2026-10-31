/**
 * A paper named the way the exam board prints it (mirrors paperParts in apps/web/src/lib/api.ts):
 *   AQA      7408 / "1"  / "Paper 1"                                  -> Paper 1 (7408/1)
 *   Edexcel  8PH0 / "01" / "Core Physics I"                           -> Paper 1 (8PH0/01) · Core Physics I
 *   IAL      YPH11 / "U1" / "Unit 1: Mechanics and Materials (WPH11)" -> Unit 1 (WPH11) · Mechanics and Materials
 *   Maths    YMA01 / "M1" / "Mechanics 1 (WME01)"                     -> Mechanics 1 (WME01)
 * The printed code comes from "(...)" at the end of the component name, else subject code / paper code.
 */
export function paperParts(subjectCode: string, paperCode: string, componentName: string | null): { head: string; title: string | null; code: string } {
  const name = (componentName ?? '').trim();
  const bracket = /\(([^()]+)\)\s*$/.exec(name);
  const code = bracket ? bracket[1].trim() : `${subjectCode}/${paperCode}`;
  const bare = bracket ? name.slice(0, bracket.index).trim() : name;
  if (!bare) return { head: `Paper ${paperCode}`, title: null, code };
  const colon = bare.indexOf(': ');
  if (colon > 0) return { head: bare.slice(0, colon), title: bare.slice(colon + 2), code };
  if (/^(paper|unit|module)\b/i.test(bare) || !/^\d+$/.test(paperCode)) return { head: bare, title: null, code };
  // Edexcel style: the name is only the title ("Core Physics I"), the number is the paper code
  return { head: `Paper ${Number(paperCode)}`, title: bare, code };
}

/** "Unit 1 (WPH11) · Mechanics and Materials"; several papers in one filter option share the head and list every code. */
export function paperFacetLabel(papers: { subjectCode: string; paperCode: string; componentName: string | null }[]): string {
  const parts = papers.map((p) => paperParts(p.subjectCode, p.paperCode, p.componentName));
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
  const heads = uniq(parts.map((p) => p.head));
  const titles = uniq(parts.map((p) => p.title));
  const sameTitle = titles.length === 1 && parts.every((p) => p.title === titles[0]);
  return `${heads.join(' / ')} (${uniq(parts.map((p) => p.code)).join(', ')})${sameTitle ? ` · ${titles[0]}` : ''}`;
}
