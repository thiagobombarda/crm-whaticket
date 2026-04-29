const POPUP_AUTOCLOSE_ERROR_MS = 4000;
const POPUP_AUTOCLOSE_SUCCESS_MS = 2000;

const TITLE_ERROR = "Erro";
const TITLE_SUCCESS = "Conectado!";

export const closePopupHtml = (message: string, isError = false): string => `
  <!DOCTYPE html>
  <html>
  <head><meta charset="utf-8"><title>Instagram</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center;
           justify-content: center; height: 100vh; margin: 0; background: #f7f8fa; }
    .box { text-align: center; padding: 40px; background: #fff; border-radius: 16px;
           box-shadow: 0 4px 24px rgba(0,0,0,.1); max-width: 360px; }
    h2   { margin: 0 0 8px; color: ${isError ? "#ef4444" : "#16a34a"}; font-size: 20px; }
    p    { margin: 0; color: #6b7280; font-size: 14px; }
  </style>
  </head>
  <body>
    <div class="box">
      <h2>${isError ? TITLE_ERROR : TITLE_SUCCESS}</h2>
      <p>${message}</p>
    </div>
    <script>setTimeout(() => window.close(), ${isError ? POPUP_AUTOCLOSE_ERROR_MS : POPUP_AUTOCLOSE_SUCCESS_MS})</script>
  </body>
  </html>`;
