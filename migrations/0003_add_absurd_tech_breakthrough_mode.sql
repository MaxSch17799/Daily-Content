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
VALUES (
  'absurd_tech_breakthrough',
  'Absurd Tech Breakthrough',
  'en',
  'gpt-5.4-mini',
  'gpt-image-1-mini',
  'medium',
  'Create one fictional absurd technology breakthrough in English. It should feel like a ridiculous viral AI slop post about a new invention, weapon, vehicle, robot, gadget, or scientific prototype. Make the concept extremely funny, overconfident, and visually absurd. Keep it clearly fictional and do not claim a real company, government, university, or person actually built it. Avoid real brand logos, readable text, gore, hate, and real-world instructions for weapons or dangerous devices. Do not repeat recent items.',
  'hyperrealistic viral AI slop, glossy fake technology press photo, absurd impossible engineering, dramatic lighting, no readable text in image',
  1,
  datetime('now')
);
