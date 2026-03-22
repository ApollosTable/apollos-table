// evaluator/identifier.js
const Anthropic = require('@anthropic-ai/sdk').default;
const { imageToBase64 } = require('../scanner/images');

let _client = null;

function getClient() {
  if (!_client) {
    _client = process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : new Anthropic();
  }
  return _client;
}

function buildIdentificationPrompt(title, description) {
  return `You are an expert resale evaluator. Identify this item from the photos and listing info.

Listing title: "${title}"
Listing description: "${description || 'none provided'}"

Return ONLY a JSON object with these exact fields:
{
  "item_type": "what this item is (e.g., 'office chair', 'power drill', 'monitor')",
  "brand": "brand name or null if not identifiable",
  "model": "model name/number or null if not identifiable",
  "condition": "new|like-new|good|fair|poor",
  "weight_class": "under_10lb|10_30lb|30_70lb|70lb_plus",
  "ebay_search_query": "the exact search string you would use on eBay to find sold comps for this item",
  "notes": "anything that affects resale value (missing parts, damage, collectibility, etc.)"
}

For ebay_search_query: be specific enough to find this exact item but general enough to get results. Include brand and model if known. Example: "Herman Miller Aeron office chair size B" not just "chair".

If you cannot identify the item at all from the photos, return: {"item_type": null}`;
}

function parseIdentificationResponse(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch { /* fall through */ }
    }
    return null;
  }
}

async function identifyItem(listing) {
  const images = JSON.parse(listing.images || '[]');
  if (images.length === 0) return null;

  const imageContent = [];
  for (const imgPath of images.slice(0, 5)) {
    const b64 = imageToBase64(imgPath);
    if (b64) {
      imageContent.push({
        type: 'image',
        source: { type: 'base64', ...b64 }
      });
    }
  }

  if (imageContent.length === 0) return null;

  const prompt = buildIdentificationPrompt(listing.title, listing.description);

  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        ...imageContent,
        { type: 'text', text: prompt }
      ]
    }]
  });

  const result = parseIdentificationResponse(response.content[0].text);
  if (!result || !result.item_type) return null;
  return result;
}

module.exports = { buildIdentificationPrompt, parseIdentificationResponse, identifyItem };
