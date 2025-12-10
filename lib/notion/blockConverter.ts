import { NotionBlock, RichText } from './types';

/**
 * Convert Notion blocks to plain text
 */
export function convertBlocksToText(blocks: NotionBlock[]): string {
  const textParts: string[] = [];

  for (const block of blocks) {
    if (block.archived) {
      continue; // Skip archived blocks
    }

    const blockText = convertBlockToText(block);
    if (blockText) {
      textParts.push(blockText);
    }
  }

  return textParts.join('\n\n').trim();
}

/**
 * Convert a single Notion block to text
 */
function convertBlockToText(block: NotionBlock): string | null {
  switch (block.type) {
    case 'paragraph':
      return extractRichText(block.paragraph?.rich_text || []);

    case 'heading_1':
      return extractRichText(block.heading_1?.rich_text || []);

    case 'heading_2':
      return extractRichText(block.heading_2?.rich_text || []);

    case 'heading_3':
      return extractRichText(block.heading_3?.rich_text || []);

    case 'bulleted_list_item':
      return `• ${extractRichText(block.bulleted_list_item?.rich_text || [])}`;

    case 'numbered_list_item':
      return `1. ${extractRichText(block.numbered_list_item?.rich_text || [])}`;

    case 'to_do':
      const checked = block.to_do?.checked ? '✓' : '☐';
      return `${checked} ${extractRichText(block.to_do?.rich_text || [])}`;

    case 'toggle':
      return extractRichText(block.toggle?.rich_text || []);

    case 'code':
      const codeText = extractRichText(block.code?.rich_text || []);
      const language = block.code?.language || '';
      return language ? `\`\`\`${language}\n${codeText}\n\`\`\`` : codeText;

    case 'quote':
      return `> ${extractRichText(block.quote?.rich_text || [])}`;

    case 'callout':
      const calloutText = extractRichText(block.callout?.rich_text || []);
      const emoji = block.callout?.icon?.emoji || '💡';
      return `${emoji} ${calloutText}`;

    case 'divider':
      return '---';

    case 'table':
      // Tables are complex, extract as structured text
      return '[Table content]';

    case 'table_row':
      // Table rows are handled within table blocks
      return null;

    case 'column_list':
    case 'column':
      // Column layouts - content is in child blocks
      return null;

    case 'unsupported':
      return '[Unsupported block type]';

    default:
      // Try to extract rich_text from any block type
      const blockData = block[block.type as string] as any;
      if (blockData?.rich_text) {
        return extractRichText(blockData.rich_text);
      }
      return null;
  }
}

/**
 * Extract plain text from rich text array
 */
function extractRichText(richText: RichText[]): string {
  if (!richText || richText.length === 0) {
    return '';
  }

  return richText
    .map((rt) => {
      if (rt.plain_text) {
        return rt.plain_text;
      }
      if (rt.text?.content) {
        return rt.text.content;
      }
      return '';
    })
    .join('')
    .trim();
}


