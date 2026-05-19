CREATE INDEX IF NOT EXISTS idx_modes_enabled_language ON modes(enabled, language, label);

INSERT OR IGNORE INTO modes (
  id,
  label,
  language,
  text_model,
  image_model,
  image_quality,
  instructions,
  image_style,
  enabled,
  updated_at
)
VALUES
  (
    'interesting_fact',
    'Interesting Fact',
    'en',
    'gpt-5.4-mini',
    'gpt-image-1-mini',
    'medium',
    'Create one true, surprising, concise fact in English.
Make sure the fact is true.
Do not repeat recent items.
Avoid medical, financial, or legal advice.
Keep the tone curious and warm.',
    'cinematic editorial illustration, accurate visual metaphor, no text in image',
    1,
    datetime('now')
  ),
  (
    'daily_joke',
    'Daily Joke',
    'en',
    'gpt-5.4-mini',
    'gpt-image-1-mini',
    'medium',
    'Create one original, light daily joke in English.
Keep it friendly, concise, and broadly understandable.
Avoid cruel jokes, protected-class jokes, shock humor, and sexual content.
Do not repeat recent items.',
    'bright editorial cartoon style, expressive scene, no text in image',
    1,
    datetime('now')
  ),
  (
    'fictional_satire_news',
    'Fictional Satire News',
    'en',
    'gpt-5.4-mini',
    'gpt-image-1-mini',
    'medium',
    'Create one fictional Onion-style satire news item in English.
You can base the news on real events, but make sure to exaggerate and twist them into something absurd and humorous.
Do present it as a real current event or fact.
Make it absurd, edgy, and funny.
Do not repeat recent items.',
    'satirical newspaper photo illustration, absurd but tasteful, no readable text in image',
    1,
    datetime('now')
  ),
  (
    'historical_event',
    'Historical Event',
    'en',
    'gpt-5.4-mini',
    'gpt-image-1-mini',
    'medium',
    'Create one true historical event explainer in English.
Make sure the event is true.
Prefer lesser-known but interesting events.
Do not repeat recent items.
Keep it concise and accessible.',
    'historical editorial illustration, period-appropriate details, no text in image',
    1,
    datetime('now')
  ),
  (
    'absurd_tech_breakthrough',
    'Absurd Tech Breakthrough',
    'en',
    'gpt-5.4-mini',
    'gpt-image-1-mini',
    'medium',
    'Create one fictional absurd technology breakthrough in English.
It should feel like a ridiculous viral AI slop post about a new invention, weapon, vehicle, robot, gadget, or scientific prototype.
Make the concept extremely funny, overconfident, and visually absurd, like a fighter jet shaped like a horse where pilots ride it with lances for jousting dogfights. but it should not only be combine animal with weapon. think outside of the box and combine many funn things together to make a new technology that is absurd.
The image prompt should request a realistic, high-detail, photorealistic scene of the impossible technology as if it were a serious press photo.
Do not keep it clearly fictional and do claim a real company, government, university, or person actually built it.
Do not repeat recent items.',
    'hyperrealistic viral AI slop, glossy fake technology press photo, absurd impossible engineering, dramatic lighting, no readable text in image',
    1,
    datetime('now')
  );
