export const extractContentSections = (html: string) => {
  const sections = [...html.matchAll(/<(section|article|div)[^>]*>([\s\S]*?)<\/(section|article|div)>/gi)]
    .slice(0, 30)
    .map((match) => match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 12);

  return sections;
};

export const extractHeadings = (html: string) => [...html.matchAll(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi)]
  .map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
  .filter(Boolean)
  .slice(0, 12);
