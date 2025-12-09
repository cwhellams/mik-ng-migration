import { escapeHtml, sanitizeUrl } from '@mik-ng/shared'

const mik_logo_url =
  process.env.MIK_LOGO_URL ?? 'https://walrus-app-sa62h.ondigitalocean.app/mik-logo-blue.png'

export const emailTemplate = (title: string, body: string, footer?: string) => `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; padding: 40px;">
    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); padding: 40px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="${mik_logo_url}" alt="MIK Logo" style="max-width: 120px;" />
      </div>

      <h2 style="text-align: center; color: #003366;">${escapeHtml(title)}</h2>

      <div style="color: #333333">
        ${body}
      </div>

      ${
        footer
          ? `
        <hr style="margin-top: 32px; border: none; border-top: 1px solid #dddddd;" />

      <p style="font-size: 0.9em; color: #666666;">
        ${footer}
      </p>
        `
          : ''
      }
    </div>
  </div>`

export const emailButton = (href: string, title: string) => `
  <a href="${sanitizeUrl(href)}" style="
    background-color: #003366;
    color: #ffffff;
    padding: 12px 24px;
    text-decoration: none;
    border-radius: 6px;
    display: inline-block;
    font-weight: bold;
  ">${escapeHtml(title)}</a>`
