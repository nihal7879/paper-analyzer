/** Relative storage keys for everything belonging to one paper. Becomes DB columns + S3 keys later. */
export function paperKeys(paperId: string) {
  const dir = `papers/${paperId}`;
  return {
    dir,
    meta: `${dir}/paper.json`,
    status: `${dir}/status.json`,
    extraction: `${dir}/extraction.json`,
    qp: `${dir}/qp.pdf`,
    ms: `${dir}/ms.pdf`,
    page: (kind: 'qp' | 'ms', n: number) => `${dir}/pages/${kind}-p${n}.png`,
    questionImage: (questionId: string, n: number) => `${dir}/questions/${questionId}-img${n}.webp`,
  };
}
