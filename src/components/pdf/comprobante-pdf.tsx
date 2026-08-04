import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';

import {
  ETIQUETA_CONDICION_VENTA,
  ETIQUETA_TIPO,
  formatearNumeroComprobante,
} from '@/lib/domain/comprobantes/etiquetas';
import { CODIGO_AFIP, esNoFiscal, letraDeTipo } from '@/lib/domain/comprobantes/letra';
import { formatearCuit } from '@/lib/domain/fiscal/cuit';
import { ETIQUETA_CONDICION_IVA } from '@/lib/domain/opciones';
import { formatearFecha } from '@/lib/fechas';
import { formatearMoneda, formatearNumero } from '@/lib/format';
import type {
  CondicionIva,
  CondicionVenta,
  TipoComprobante,
} from '@/lib/supabase/database.types';

/**
 * Impresión del comprobante con el formato de la RG 1415: emisor a la
 * izquierda, receptor abajo, y el recuadro de la letra al medio con el
 * código de comprobante de AFIP.
 *
 * En una A el IVA se imprime desglosado por renglón; en una B o C no, y
 * el pie aclara que los precios ya lo incluyen.
 */

export type DatosPdf = {
  empresa: {
    razonSocial: string;
    nombreFantasia: string | null;
    cuit: string;
    condicionIva: CondicionIva;
    domicilio: string | null;
    localidad: string | null;
    provincia: string | null;
    ingresosBrutos: string | null;
    inicioActividades: string | null;
  };
  comprobante: {
    tipo: TipoComprobante;
    numero: number | null;
    puntoVenta: number | null;
    fechaEmision: string;
    fechaVencimiento: string | null;
    condicionVenta: CondicionVenta;
    netoGravado: number;
    exento: number;
    netoNoGravado: number;
    iva105: number;
    iva21: number;
    iva27: number;
    otrosImpuestos: number;
    descuentoPorcentaje: number;
    descuentoImporte: number;
    total: number;
    cae: string | null;
    caeVencimiento: string | null;
    observaciones: string | null;
    origen: string | null;
  };
  cliente: {
    razonSocial: string;
    documento: string | null;
    condicionIva: CondicionIva;
    domicilio: string | null;
    localidad: string | null;
  };
  items: {
    orden: number;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    descuentoPorcentaje: number;
    alicuotaIva: number;
    subtotal: number;
  }[];
};

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 8.5, fontFamily: 'Helvetica', color: '#18181b' },

  marco: { borderWidth: 1, borderColor: '#18181b', borderStyle: 'solid' },

  encabezado: { flexDirection: 'row', minHeight: 92 },
  bloqueEmisor: { flex: 1, padding: 8, borderRightWidth: 1, borderColor: '#18181b' },
  bloqueLetra: {
    width: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderColor: '#18181b',
  },
  letraGrande: { fontSize: 30, fontFamily: 'Helvetica-Bold' },
  codigoAfip: { fontSize: 6.5, marginTop: 2 },
  bloqueDatos: { flex: 1, padding: 8 },

  titulo: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  sub: { color: '#52525b' },
  fila: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1.5 },
  etiqueta: { color: '#52525b' },

  seccion: { marginTop: 6, padding: 8 },

  th: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#18181b',
    paddingBottom: 3,
    marginBottom: 3,
    fontFamily: 'Helvetica-Bold',
  },
  tr: {
    flexDirection: 'row',
    paddingVertical: 2.5,
    borderBottomWidth: 0.5,
    borderColor: '#d4d4d8',
  },
  cDesc: { flex: 1 },
  cNum: { width: 52, textAlign: 'right' },
  cImp: { width: 70, textAlign: 'right' },
  cIva: { width: 38, textAlign: 'right' },

  pie: { marginTop: 8, flexDirection: 'row', gap: 8 },
  totales: { width: 210, marginLeft: 'auto' },
  totalFila: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  totalFinal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: '#18181b',
    paddingTop: 3,
    marginTop: 3,
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
  },
  cae: { marginTop: 10, paddingTop: 6, borderTopWidth: 1, borderColor: '#18181b' },
  nota: { marginTop: 6, color: '#52525b', fontSize: 7.5 },
  borrador: {
    marginBottom: 6,
    padding: 4,
    borderWidth: 1,
    borderColor: '#b91c1c',
    color: '#b91c1c',
    textAlign: 'center',
    fontFamily: 'Helvetica-Bold',
  },
});

function Etiqueta({ children }: { children: string }) {
  return <Text style={s.etiqueta}>{children}</Text>;
}

export function ComprobantePdf({ empresa, comprobante, cliente, items }: DatosPdf) {
  const letra = letraDeTipo(comprobante.tipo);
  const interno = esNoFiscal(comprobante.tipo);
  const discrimina = letra === 'A';
  const codigo = CODIGO_AFIP[comprobante.tipo];
  const domicilioEmpresa = [empresa.domicilio, empresa.localidad, empresa.provincia]
    .filter(Boolean)
    .join(', ');

  return (
    <Document
      title={`${ETIQUETA_TIPO[comprobante.tipo]} ${formatearNumeroComprobante(
        comprobante.puntoVenta,
        comprobante.numero,
      )}`}
    >
      <Page size="A4" style={s.page}>
        {comprobante.numero === null ? (
          <Text style={s.borrador}>BORRADOR · SIN VALIDEZ FISCAL</Text>
        ) : null}

        {/* ---------- Encabezado ---------- */}
        <View style={[s.marco, s.encabezado]}>
          <View style={s.bloqueEmisor}>
            <Text style={s.titulo}>{empresa.nombreFantasia || empresa.razonSocial}</Text>
            {empresa.nombreFantasia ? <Text style={s.sub}>{empresa.razonSocial}</Text> : null}
            {domicilioEmpresa ? <Text style={s.sub}>{domicilioEmpresa}</Text> : null}
            <Text style={s.sub}>CUIT {formatearCuit(empresa.cuit)}</Text>
            <Text style={s.sub}>{ETIQUETA_CONDICION_IVA[empresa.condicionIva]}</Text>
            {empresa.ingresosBrutos ? (
              <Text style={s.sub}>Ingresos Brutos {empresa.ingresosBrutos}</Text>
            ) : null}
            {empresa.inicioActividades ? (
              <Text style={s.sub}>
                Inicio de actividades {formatearFecha(empresa.inicioActividades)}
              </Text>
            ) : null}
          </View>

          <View style={s.bloqueLetra}>
            <Text style={s.letraGrande}>{interno ? 'X' : letra}</Text>
            {codigo ? <Text style={s.codigoAfip}>COD. {codigo}</Text> : null}
          </View>

          <View style={s.bloqueDatos}>
            <Text style={s.titulo}>{ETIQUETA_TIPO[comprobante.tipo]}</Text>
            <View style={s.fila}>
              <Etiqueta>N°</Etiqueta>
              <Text>{formatearNumeroComprobante(comprobante.puntoVenta, comprobante.numero)}</Text>
            </View>
            <View style={s.fila}>
              <Etiqueta>Fecha</Etiqueta>
              <Text>{formatearFecha(comprobante.fechaEmision)}</Text>
            </View>
            <View style={s.fila}>
              <Etiqueta>Condición de venta</Etiqueta>
              <Text>{ETIQUETA_CONDICION_VENTA[comprobante.condicionVenta]}</Text>
            </View>
            {comprobante.fechaVencimiento ? (
              <View style={s.fila}>
                <Etiqueta>Vencimiento</Etiqueta>
                <Text>{formatearFecha(comprobante.fechaVencimiento)}</Text>
              </View>
            ) : null}
            {comprobante.origen ? (
              <View style={s.fila}>
                <Etiqueta>Comprobante asociado</Etiqueta>
                <Text>{comprobante.origen}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ---------- Receptor ---------- */}
        <View style={[s.marco, s.seccion]}>
          <View style={s.fila}>
            <Etiqueta>Señor/es</Etiqueta>
            <Text>{cliente.razonSocial}</Text>
          </View>
          <View style={s.fila}>
            <Etiqueta>CUIT / Documento</Etiqueta>
            <Text>{cliente.documento ? formatearCuit(cliente.documento) : 'Consumidor final'}</Text>
          </View>
          <View style={s.fila}>
            <Etiqueta>Condición frente al IVA</Etiqueta>
            <Text>{ETIQUETA_CONDICION_IVA[cliente.condicionIva]}</Text>
          </View>
          {cliente.domicilio ? (
            <View style={s.fila}>
              <Etiqueta>Domicilio</Etiqueta>
              <Text>
                {cliente.domicilio}
                {cliente.localidad ? `, ${cliente.localidad}` : ''}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ---------- Renglones ---------- */}
        <View style={[s.marco, s.seccion]}>
          <View style={s.th}>
            <Text style={s.cDesc}>Descripción</Text>
            <Text style={s.cNum}>Cantidad</Text>
            <Text style={s.cImp}>{discrimina ? 'P. unit. neto' : 'P. unitario'}</Text>
            <Text style={s.cNum}>Desc. %</Text>
            {discrimina ? <Text style={s.cIva}>IVA</Text> : null}
            <Text style={s.cImp}>Subtotal</Text>
          </View>

          {items.map((it) => (
            <View key={it.orden} style={s.tr}>
              <Text style={s.cDesc}>{it.descripcion}</Text>
              <Text style={s.cNum}>{formatearNumero(it.cantidad)}</Text>
              <Text style={s.cImp}>{formatearMoneda(it.precioUnitario)}</Text>
              <Text style={s.cNum}>
                {it.descuentoPorcentaje > 0 ? formatearNumero(it.descuentoPorcentaje) : '—'}
              </Text>
              {discrimina ? (
                <Text style={s.cIva}>{formatearNumero(it.alicuotaIva)}%</Text>
              ) : null}
              <Text style={s.cImp}>{formatearMoneda(it.subtotal)}</Text>
            </View>
          ))}
        </View>

        {/* ---------- Totales ---------- */}
        <View style={s.pie}>
          <View style={{ flex: 1 }}>
            {comprobante.observaciones ? (
              <View>
                <Text style={s.etiqueta}>Observaciones</Text>
                <Text>{comprobante.observaciones}</Text>
              </View>
            ) : null}
          </View>

          <View style={s.totales}>
            {discrimina ? (
              <>
                <View style={s.totalFila}>
                  <Etiqueta>Neto gravado</Etiqueta>
                  <Text>{formatearMoneda(comprobante.netoGravado)}</Text>
                </View>
                {comprobante.iva105 > 0 ? (
                  <View style={s.totalFila}>
                    <Etiqueta>IVA 10,5%</Etiqueta>
                    <Text>{formatearMoneda(comprobante.iva105)}</Text>
                  </View>
                ) : null}
                {comprobante.iva21 > 0 ? (
                  <View style={s.totalFila}>
                    <Etiqueta>IVA 21%</Etiqueta>
                    <Text>{formatearMoneda(comprobante.iva21)}</Text>
                  </View>
                ) : null}
                {comprobante.iva27 > 0 ? (
                  <View style={s.totalFila}>
                    <Etiqueta>IVA 27%</Etiqueta>
                    <Text>{formatearMoneda(comprobante.iva27)}</Text>
                  </View>
                ) : null}
              </>
            ) : null}

            {comprobante.descuentoImporte > 0 ? (
              <View style={s.totalFila}>
                <Etiqueta>
                  {`Descuento ${formatearNumero(comprobante.descuentoPorcentaje)}%`}
                </Etiqueta>
                <Text>− {formatearMoneda(comprobante.descuentoImporte)}</Text>
              </View>
            ) : null}

            <View style={s.totalFinal}>
              <Text>TOTAL</Text>
              <Text>{formatearMoneda(comprobante.total)}</Text>
            </View>
          </View>
        </View>

        {/* ---------- CAE ---------- */}
        {!interno ? (
          <View style={s.cae}>
            <View style={s.fila}>
              <Etiqueta>CAE N°</Etiqueta>
              <Text>{comprobante.cae ?? '—'}</Text>
            </View>
            <View style={s.fila}>
              <Etiqueta>Vencimiento del CAE</Etiqueta>
              <Text>{formatearFecha(comprobante.caeVencimiento)}</Text>
            </View>
          </View>
        ) : null}

        {!discrimina && !interno ? (
          <Text style={s.nota}>
            {letra === 'C'
              ? 'El emisor no discrimina IVA por su condición frente al impuesto.'
              : 'Los importes incluyen IVA. El comprobante clase B no lo discrimina.'}
          </Text>
        ) : null}

        {interno ? (
          <Text style={s.nota}>
            Documento no válido como factura. Los importes incluyen IVA.
          </Text>
        ) : null}
      </Page>
    </Document>
  );
}

/**
 * Render a Buffer. Se hace acá y no en el route handler porque un
 * `route.ts` no admite JSX.
 */
export function renderComprobantePdf(datos: DatosPdf): Promise<Buffer> {
  return renderToBuffer(<ComprobantePdf {...datos} />);
}
