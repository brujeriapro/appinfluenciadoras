# Probar el cobro de verdad

Wompi está configurado en producción desde hace semanas y **nunca ha pasado una
compra real**. Hasta que eso ocurra, "los pagos funcionan" es una suposición, no
un hecho: se puede tener las llaves bien puestas, la firma correcta y el webhook
apuntando a ningún lado, y todo se ve idéntico desde afuera.

Esta prueba se hace **una vez**, con plata real, y son unos $10.000. Sale más
barato que enterarse con el primer cliente.

---

## Antes de empezar

Hay que tener a mano:

- Acceso al panel de marca (una cuenta de marca cualquiera; sirve una de prueba).
- Una tarjeta real. **No** una de sandbox: el objetivo es probar producción.
- El panel de Wompi abierto en otra pestaña (comercios.wompi.co).
- Los logs de Railway abiertos, servicio `supportive-intuition`.

Y confirmar que en Railway estén las cuatro variables:

| Variable | Dónde sale en Wompi |
|---|---|
| `WOMPI_LLAVE_PUBLICA` | Ajustes → Llaves API → Llave pública (`pub_prod_…`) |
| `WOMPI_LLAVE_PRIVADA` | Ajustes → Llaves API → Llave privada (`prv_prod_…`) |
| `WOMPI_SECRETO_INTEGRIDAD` | Ajustes → Llaves API → Secreto de integridad |
| `WOMPI_SECRETO_EVENTOS` | Ajustes → Eventos → Secreto de eventos |

> ⚠️ Si la llave pública empieza por `pub_test_`, el sistema apunta al sandbox y
> esta prueba no comprueba nada de producción.

**El webhook** se registra en Wompi → Ajustes → Eventos → URL de eventos:

```
https://creatorsmanager.com/webhook/wompi
```

---

## La prueba

### 1. Armar un trato barato

Desde el panel de marca, proponerle a una creadora (puede ser una tuya) un trato
por el mínimo — $10.000 está bien. Que la creadora lo **acepte** desde su portal.

El trato tiene que quedar en estado **aceptado**: es el único desde el que se
puede pagar.

### 2. Pagar

En la línea de tiempo del trato, botón de pagar. Debe abrir el checkout de Wompi
con el monto correcto — **verificar que el monto en pantalla sea el total con
comisión**, no el monto base.

Pagar con la tarjeta real.

### 3. Qué debe pasar, en orden

| Paso | Qué se ve | Dónde |
|---|---|---|
| Vuelve del checkout | Modal "Pago confirmado" | Panel de marca |
| El trato avanza | Estado **pago retenido** | Panel de marca |
| Aparece el contacto | Teléfono y correo de la creadora | Ficha del trato |
| Llega el aviso | Correo a la creadora | Su bandeja |
| Queda el registro | Transacción `aprobada` | Panel admin → Pagos |
| Wompi lo confirma | Transacción `APPROVED` | comercios.wompi.co |

Si los seis pasan: el cobro funciona.

### 4. Devolverse la plata

Desde Wompi, anular o reembolsar la transacción. **Esto no revierte el trato en
Creators Manager** — hay que cancelarlo a mano desde el panel admin. Es a
propósito: un reembolso después de que la creadora ya empezó a grabar no puede
deshacerse solo.

---

## Si algo falla

### El checkout no abre / dice que el cobro no está habilitado

Faltan `WOMPI_LLAVE_PUBLICA` o `WOMPI_SECRETO_INTEGRIDAD` en Railway. El sistema
sigue en modo transferencia manual a propósito: es preferible a un botón de
pagar que no cobra.

### Wompi dice "firma inválida" al abrir el checkout

`WOMPI_SECRETO_INTEGRIDAD` no corresponde a la llave pública. Suele pasar por
mezclar el secreto de sandbox con la llave de producción.

### Se pagó, Wompi dice APPROVED, pero el trato sigue en "aceptado"

Es el fallo del webhook, y **el sistema se recupera solo de tres maneras**:

1. Al volver del checkout, el panel le pregunta a Wompi directamente.
2. Cada 6 horas, la conciliación barre lo que quedó pendiente.
3. A mano, cuando haga falta ya:

```bash
curl -u admin:CLAVE -X POST "https://creatorsmanager.com/api/cron/pagos?margen=0"
```

Responde cuántas revisó y cuántas resolvió. Si resolvió la transacción, el trato
avanza igual que si el webhook hubiera llegado.

Que se recupere solo **no quiere decir que esté bien**: si el webhook falla, hay
que arreglarlo. Revisar en Wompi → Eventos si los intentos aparecen como
fallidos, y qué código devuelve.

### El log dice "monto distinto"

El sistema **no aplica el pago** y lo deja a la vista. Es deliberado: dar por
pagado un trato con menos plata de la que costaba, o cobrar de más sin devolver,
son los dos errores que no se pueden arreglar solos. Hay que mirarlo a mano.

### El log dice "referencia desconocida"

Llegó un evento de Wompi para una transacción que no está en nuestra base. Pasa
si se compartió el mismo comercio de Wompi con otro sistema. No es grave —el
evento se ignora— pero conviene saber de dónde salió.

---

## Después de la prueba

Anotar en [ESTADO.md](ESTADO.md) la fecha y el resultado. Mientras diga
"nunca se ha probado una compra real", cualquier decisión que dependa de que los
cobros funcionen se está tomando a ciegas.
