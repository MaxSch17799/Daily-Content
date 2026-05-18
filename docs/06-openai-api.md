# 06. OpenAI API Setup

The ChatGPT Plus subscription is separate from API billing. This project needs an OpenAI Platform API key.

## Create API Key

1. Open the OpenAI Platform.
2. Go to API keys.
3. Create a new key.
4. Save it as a GitHub Actions secret:

```text
OPENAI_API_KEY
```

Do not put this key in the frontend or commit it to git.

## Recommended Budget

Start with a low monthly budget, such as:

```text
$5/month
```

At one generated item per day, medium images should be comfortably below that unless there are many retries or manual experiments.

## Models

Mode files define model choices:

```yaml
text_model: gpt-5.4-mini
image_model: gpt-image-1-mini
image_quality: medium
```

Files live in:

```text
modes/en/*.yaml
```

## Text Flow

The generator calls the OpenAI Responses API and asks for strict JSON with:

- `title`
- `notification_text`
- `summary`
- `full_text`
- `image_prompt`
- `uniqueness_key`
- `tags`

## Image Flow

The generator calls the OpenAI Images API with:

- `1024x1024`
- PNG output
- medium quality by default

The generated image is uploaded to R2.

