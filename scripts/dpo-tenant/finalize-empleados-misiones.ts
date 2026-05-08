/**
 * Completa el seed de empleados — después de que los auth users ya están creados
 * y los profiles existen con role default.
 *
 * Por cada empleado del listado:
 * - Actualiza profiles.role='empleado' + nombre (si cambió).
 * - Inserta empleados con profile_id correcto + legajo + numero_id + nombre.
 */
import { createClient } from "@supabase/supabase-js"

const URL = "https://bvqmsrnrdrxprbggfziu.supabase.co"
const SERVICE_KEY = process.env.DEST_SERVICE_KEY!

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

interface Empleado {
  legajo: number
  nombre: string
  dni: string | null
}

const EMPLEADOS: Empleado[] = [
  { legajo: 32561091, nombre: "ACOSTA OBERLADSTATTER JUAN FERNANDO", dni: "32561091" },
  { legajo: 709, nombre: "ACOSTA LAZARO ISMAEL", dni: "41305456" },
  { legajo: 175, nombre: "AGUIRRE DIEGO", dni: "30513906" },
  { legajo: 708, nombre: "AGUIRRE DIEGO MIGUEL", dni: "36367894" },
  { legajo: 433, nombre: "AGÜERO HERMINIO", dni: "16378519" },
  { legajo: 611, nombre: "ALMEIDA MARCOS EMANUEL", dni: "38380692" },
  { legajo: 707, nombre: "ALVEZ DE LIMA LUCAS ARIEL", dni: "43702971" },
  { legajo: 716, nombre: "ALVEZ HECTOR GABRIEL", dni: "42716456" },
  { legajo: 326, nombre: "AVALOS BRIAN", dni: "35005333" },
  { legajo: 511, nombre: "AVARO DANIEL ALBERTO", dni: "29793781" },
  { legajo: 499, nombre: "BARCHUK JAVIER ENRIQUE", dni: "34947664" },
  { legajo: 573, nombre: "BAREIRO AXEL IVAN", dni: "43528405" },
  { legajo: 604, nombre: "BARGAS RONALDO DANIEL", dni: "34477993" },
  { legajo: 602, nombre: "BARRIOS TERAN EDGAR JOSE", dni: "95854431" },
  { legajo: 442, nombre: "BARUA ALVARO", dni: "35494474" },
  { legajo: 44, nombre: "BENITEZ FABIAN", dni: "26140653" },
  { legajo: 61, nombre: "BENITEZ GUSTAVO", dni: "23213488" },
  { legajo: 44680626, nombre: "BENITEZ HUGO NICOLAS", dni: "44680626" },
  { legajo: 513, nombre: "BENITEZ VICTOR", dni: "24327946" },
  { legajo: 705, nombre: "BOGADO LEONARDO CRISTOFER", dni: "39045760" },
  { legajo: 706, nombre: "BOTHNER ERICK WILLIAN", dni: "42086382" },
  { legajo: 37591211, nombre: "BRITEZ FEDERICO", dni: "37591211" },
  { legajo: 710, nombre: "BRIZUELA SANTIAGO MARTIN", dni: "46164700" },
  { legajo: 628, nombre: "BURGIN DAIANA ELIZABETH", dni: "40414877" },
  { legajo: 576, nombre: "BUTNEN ORNELA BEATRIZ", dni: "42812395" },
  { legajo: 623, nombre: "CARBALLO SANDRA FABIANA", dni: "36464332" },
  { legajo: 704, nombre: "CARDOZO ANALIA ELIZABETH", dni: "37082417" },
  { legajo: 554, nombre: "CARTAGENA JOAN MANUEL", dni: "39527513" },
  { legajo: 603, nombre: "CASTILLO NOEMI CINTIA", dni: "37116280" },
  { legajo: 314, nombre: "CHAMULA NELSON", dni: "31110525" },
  { legajo: 403, nombre: "CLOSS GASTON EDUARDO", dni: "28399750" },
  { legajo: 526, nombre: "CRISTALDO RODRIGO ARNALDO", dni: "40041195" },
  { legajo: 550, nombre: "DAVALOS CESAR MATIAS", dni: "34734283" },
  { legajo: 622, nombre: "DIAZ JUAN CARLOS", dni: "25976559" },
  { legajo: 229, nombre: "DOS SANTOS CESAR", dni: "27498872" },
  { legajo: 618, nombre: "DUARTE DIANA ANDREA", dni: "32558432" },
  { legajo: 631, nombre: "DUARTE GASTON ANDRES", dni: "39045581" },
  { legajo: 301, nombre: "DUARTE MOISES", dni: "31141797" },
  { legajo: 141, nombre: "DUHALDE MIGUEL", dni: "23670176" },
  { legajo: 409, nombre: "DURAN LUIS", dni: "95971424" },
  { legajo: 440, nombre: "ERHARD WILD CRISTIAN ALBERTO", dni: "34734398" },
  { legajo: 489, nombre: "ESTECHE GABRIEL", dni: "40340370" },
  { legajo: 642, nombre: "FERNANDEZ AGUSTÍN EZEQUIEL", dni: "43620501" },
  { legajo: 616, nombre: "FIGUEROA FERNANDO EMANUEL", dni: "40413344" },
  { legajo: 539, nombre: "FLEITAS MARIANA YISEL", dni: "38774019" },
  { legajo: 56, nombre: "FRAGOZO ESTEBAN", dni: "16829238" },
  { legajo: 557, nombre: "FREITAS ALEJANDRO CLAUS", dni: "32608224" },
  { legajo: 205, nombre: "GALEANO JUAN", dni: "28412406" },
  { legajo: 67, nombre: "GARCIA SERGIO", dni: "18711456" },
  { legajo: 534, nombre: "GARDA CHIARA VALERIA", dni: "41155816" },
  { legajo: 506, nombre: "GAZTKE FRANCO", dni: "39527916" },
  { legajo: 528, nombre: "GIMENEZ LUCAS HERNAN", dni: "43547665" },
  { legajo: 195, nombre: "GOMEZ CESAR", dni: "26827715" },
  { legajo: 453, nombre: "GOMEZ DE ALMEIDA MAURICIO", dni: "33854586" },
  { legajo: 447, nombre: "GROCHOWSKI ERNESTO", dni: "36060454" },
  { legajo: 597, nombre: "IRALA JORGE IVAN", dni: "38242519" },
  { legajo: 515, nombre: "JARA ADRIAN", dni: "36096333" },
  { legajo: 636, nombre: "JURADO JULIO ALEJANDRO", dni: "38774361" },
  { legajo: 236, nombre: "KUSI JAVIER GUSTAVO", dni: "27997153" },
  { legajo: 615, nombre: "LOPEZ MATEO DAVID", dni: "40334884" },
  { legajo: 470, nombre: "MARTINEZ ESTEFANIA EMILCE", dni: "37678918" },
  { legajo: 621, nombre: "MEDINA MARCELA DANIELA", dni: "18466602" },
  { legajo: 263, nombre: "MEDINA RAMON", dni: "30865249" },
  { legajo: 458, nombre: "MENDOZA NESTOR AGUSTIN", dni: "35328984" },
  { legajo: 703, nombre: "MICHAJLOW CYRO", dni: "41871892" },
  { legajo: 598, nombre: "MIRANDA EVELIN LETICIA", dni: "37453808" },
  { legajo: 581, nombre: "MOREL CINIA NOEMI", dni: "33805401" },
  { legajo: 619, nombre: "NARDI ELIAS MIGUEL", dni: "41048556" },
  { legajo: 249, nombre: "NUNEZ EDGAR", dni: "30920378" },
  { legajo: 222, nombre: "OCAMPO CRISTIAN", dni: "32561321" },
  { legajo: 156, nombre: "OCAMPO NOLBERTO", dni: "17714391" },
  { legajo: 599, nombre: "OLIVERA NORMA BEATRIZ", dni: "35694264" },
  { legajo: 118, nombre: "ORSETTI ENZO", dni: "34973211" },
  { legajo: 432, nombre: "ORTIZ EDUARDO", dni: "16294320" },
  { legajo: 15, nombre: "OSTENEROS CLAUDIO EDUARDO", dni: "20899149" },
  { legajo: 485, nombre: "OSTENEROS EDUARDO ADRIAN", dni: "41155649" },
  { legajo: 53, nombre: "OSTENEROS MARIANELA", dni: "26957633" },
  { legajo: 186, nombre: "OSTENEROS PATRICIA ELIZABETH", dni: "23383475" },
  { legajo: 591, nombre: "PANIAGUA FABRICIO LEONEL", dni: "42272630" },
  { legajo: 115, nombre: "PEDERSEN FERNANDO", dni: "30956954" },
  { legajo: 305, nombre: "RAMIREZ OSCAR OMAR", dni: "34734196" },
  { legajo: 160, nombre: "RAMIREZ RAUL IVAN", dni: "32621913" },
  { legajo: 299, nombre: "REICHEL JUAN CARLOS", dni: "31698060" },
  { legajo: 522, nombre: "ROJAS FABIAN OMAR", dni: "39223430" },
  { legajo: 600, nombre: "ROJAS GONZALO NICOLAS", dni: "45604266" },
  { legajo: 546, nombre: "ROJAS LUIS ALBERTO", dni: "28256236" },
  { legajo: 439, nombre: "ROLON VICTOR", dni: "29410857" },
  { legajo: 543, nombre: "ROMERO MEDINA LEONARDO", dni: "32183033" },
  { legajo: 415, nombre: "ROMERO SUSANA", dni: "32943963" },
  { legajo: 9999999, nombre: "SERENO", dni: null },
  { legajo: 119, nombre: "SERVIN ELADIO", dni: "27184335" },
  { legajo: 531, nombre: "SILVERO CLAUDIO MAXIMILIANO", dni: "35871695" },
  { legajo: 464, nombre: "THOMAS SANDRA", dni: "23048933" },
  { legajo: 595, nombre: "VAZQUEZ ENZO ADRIAN", dni: "40194777" },
  { legajo: 341, nombre: "VERGARA FERNANDO", dni: "26856648" },
  { legajo: 566, nombre: "VETTORI ALBERTO ANDRES", dni: "29144362" },
  { legajo: 111, nombre: "ZEISS RICARDO", dni: "28544331" },
]

async function main() {
  let ok = 0
  let err = 0

  for (const e of EMPLEADOS) {
    const email = `${e.legajo}@distribuciones.local`
    const numero_id = e.dni ?? String(e.legajo)

    // Buscar el profile por email
    const { data: prof, error: errProf } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle()

    if (errProf || !prof) {
      console.log(`  FAIL ${e.legajo} profile no encontrado: ${errProf?.message ?? "sin profile"}`)
      err++
      continue
    }

    // Update role + nombre
    const { error: errUpd } = await supabase
      .from("profiles")
      .update({ role: "empleado", nombre: e.nombre, active: true })
      .eq("id", prof.id)

    if (errUpd) {
      console.log(`  FAIL ${e.legajo} update role: ${errUpd.message}`)
      err++
      continue
    }

    // Check si ya existe empleado
    const { data: existing } = await supabase
      .from("empleados")
      .select("id")
      .eq("legajo", e.legajo)
      .maybeSingle()

    if (!existing) {
      const { error: errEmp } = await supabase.from("empleados").insert({
        profile_id: prof.id,
        legajo: e.legajo,
        nombre: e.nombre,
        numero_id,
        activo: true,
      })
      if (errEmp) {
        console.log(`  FAIL ${e.legajo} empleado: ${errEmp.message}`)
        err++
        continue
      }
    }

    ok++
    if (ok % 10 === 0) console.log(`  ... ${ok} procesados`)
  }

  console.log(`\nOK: ${ok} · FAIL: ${err}`)
}

main().catch(console.error)
