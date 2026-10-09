# TV Hub V6: Support Operations

TV Hub V6 es la versión docente para operaciones de Reports. Mantiene MVC simple y agrega reacciones del backend después de persistir cambios: correo, automatización y actualizaciones en tiempo real.

## Flujo de Reports

```text
Usuario → POST /api/reports → MongoDB
                              ├→ correo de nuevo Report
                              └→ report:created → Socket.IO → soporte

ADMIN → PATCH /api/admin/reports/:id/close → MongoDB
                                               ├→ correo al reportante
                                               └→ report:updated → usuario y soporte
```

Los fallos de correo no revierten datos persistidos.

## Soporte

- `/reports.html`: Reports propios del usuario autenticado.
- `/support-reports.html`: cola completa y cierre de Reports para `ADMIN`.
- `/support-metrics.html`: gráfica de Reports cerrados y tiempo promedio de respuesta de los últimos 14 días.

Un cierre establece `status: RESOLVED`, `resolvedAt` y `resolvedBy`. No borra el Report ni sus evidencias.

Las listas de usuario y soporte inician con el filtro **Open**. Ambas permiten cambiar a **Closed** o **All**. Cuando un Report llega como `RESOLVED`, la interfaz del usuario deshabilita Edit y Delete, y el backend también rechaza esas operaciones para proteger el cierre.

## Automatización y tiempo real

`node-cron` detecta Reports `OPEN` más antiguos que `REPORT_ESCALATION_MINUTES` y los marca como `ESCALATED`. Socket.IO usa la cookie JWT existente: el propietario recibe cambios de sus Reports y los administradores reciben todos los eventos de soporte.

## Correo

Sin `SMTP_HOST`, Nodemailer crea una cuenta Ethereal temporal y muestra una URL `Email preview:` en la consola. Con SMTP configurado, utiliza las variables de `.env.example`.

## Variables principales

```dotenv
REPORT_NOTIFICATION_EMAIL=reports@tvhub.local
REPORT_ESCALATION_MINUTES=2
REPORT_ESCALATION_CRON=*/1 * * * *
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=TV Hub <no-reply@tvhub.local>
```

## Demo

1. Inicia sesión como `admin@mail.com` y abre Support Dashboard.
2. En otra sesión, crea un Report con un usuario normal.
3. El Report aparece en soporte sin refrescar y se imprime una URL Ethereal.
4. Cierra el Report desde soporte; el usuario ve `RESOLVED`, recibe correo y Metrics se actualiza.
5. Deja otro Report OPEN para observar la escalación automática.
