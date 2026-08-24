pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('pdfFile');
    const fileNameSpan = document.getElementById('fileName');
    const btnGenerar = document.getElementById('btnGenerar');

    if (fileInput) {
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                fileNameSpan.textContent = file.name;
                btnGenerar.disabled = false;
            } else {
                fileNameSpan.textContent = "Ningún archivo seleccionado";
                btnGenerar.disabled = true;
            }
        });
    }
});

async function procesarPDF() {
    const fileInput = document.getElementById('pdfFile');
    const file = fileInput.files[0];
    if (!file) return;

    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('btnGenerar').disabled = true;

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let lineasTexto = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            let items = textContent.items.map(item => ({
                str: item.str,
                y: item.transform[5],
                x: item.transform[4]
            }));

            items.sort((a, b) => b.y - a.y || a.x - b.x);
            
            let lineaActual = "";
            let ultimoY = null;

            items.forEach(item => {
                if (ultimoY === null || Math.abs(item.y - ultimoY) > 6) {
                    if (lineaActual.trim() !== "") lineasTexto.push(lineaActual.trim());
                    lineaActual = item.str;
                    ultimoY = item.y;
                } else {
                    lineaActual += " " + item.str;
                }
            });
            if (lineaActual.trim() !== "") lineasTexto.push(lineaActual.trim());
        }

        const horarioData = parsearSIAPerfecto(lineasTexto);
        dibujarGrillaDinamica(horarioData);

    } catch (error) {
        console.error("Error al procesar el PDF:", error);
        alert("Hubo un error al leer el PDF. Revisa la consola.");
    } finally {
        document.getElementById('loading').classList.add('hidden');
        btnGenerar.disabled = false;
    }
}

function parsearSIAPerfecto(lineas) {
    const diasValidos = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO", "SABADO"];
    let horario = { LUNES: [], MARTES: [], MIÉRCOLES: [], JUEVES: [], VIERNES: [], SÁBADO: [] };
    let diaActual = null;
    let acumuladorTexto = "";

    lineas.forEach(linea => {
        let diaEncontrado = diasValidos.find(d => linea.toUpperCase().includes(d) && !linea.toUpperCase().includes("PAG"));
        if (diaEncontrado) {
            diaActual = diaEncontrado === "SABADO" ? "SÁBADO" : diaEncontrado;
            linea = linea.replace(diaEncontrado, "").trim();
            acumuladorTexto = "";
        }

        if (!diaActual) return;

        let matchHoras = linea.match(/(\d{2}:\d{2})\s+(\d{2}:\d{2})/);
        if (matchHoras) {
            let h1 = matchHoras[1];
            let h2 = matchHoras[2];
            let m1 = horaAMinutos(h1);
            let m2 = horaAMinutos(h2);

            let inicio = m1 <= m2 ? h1 : h2;
            let fin = m1 <= m2 ? h2 : h1;
            let minInicio = Math.min(m1, m2);
            let minFin = Math.max(m1, m2);

            let detalle = (acumuladorTexto + " " + linea.replace(matchHoras[0], "")).trim();
            acumuladorTexto = "";

            let matchCodigo = detalle.match(/\[(.*?)\]/);
            let codigoAsignatura = matchCodigo ? matchCodigo[1] : detalle;

            let indexExistente = horario[diaActual].findIndex(c => {
                let matchC = c.detalle.match(/\[(.*?)\]/);
                let codigoC = matchC ? matchC[1] : c.detalle;
                return codigoC === codigoAsignatura;
            });

            if (indexExistente === -1) {
                if (detalle.length > 3) {
                    horario[diaActual].push({
                        inicio: inicio,
                        fin: fin,
                        minInicio: minInicio,
                        minFin: minFin,
                        detalle: detalle
                    });
                }
            } else {
                let claseAnterior = horario[diaActual][indexExistente];
                let duracionAnterior = claseAnterior.minFin - claseAnterior.minInicio;
                let duracionNueva = minFin - minInicio;

                // Si la nueva entrada tiene más peso o duración, reemplazamos; si no, conservamos la principal.
                if (duracionNueva > duracionAnterior) {
                    horario[diaActual][indexExistente] = {
                        inicio: inicio,
                        fin: fin,
                        minInicio: minInicio,
                        minFin: minFin,
                        detalle: detalle
                    };
                }
            }
        } else {
            if (linea.length > 2 && !linea.includes("Leyenda") && !linea.includes("Universidad") && !linea.includes("Franja") && !linea.includes("Facultad") && !linea.includes("Plan")) {
                acumuladorTexto += " " + linea;
            }
        }
    });

    return horario;
}
function horaAMinutos(horaStr) {
    const [h, m] = horaStr.split(':').map(Number);
    return h * 60 + m;
}

function dibujarGrillaDinamica(horario) {
    const canvas = document.getElementById('horarioCanvas');
    const ctx = canvas.getContext('2d');
    canvas.classList.remove('hidden');

    let diasActivos = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES"];
    if (horario["SÁBADO"] && horario["SÁBADO"].length > 0) {
        diasActivos.push("SÁBADO");
    }

    let minHour = 7;
    let maxHour = 18;

    Object.values(horario).forEach(clases => {
        clases.forEach(clase => {
            let hInicio = Math.floor(clase.minInicio / 60);
            let hFin = Math.ceil(clase.minFin / 60);

            if (hInicio < minHour) minHour = Math.max(6, hInicio);
            if (hFin > maxHour) maxHour = Math.min(22, hFin);
        });
    });

    if (maxHour - minHour < 8) {
        maxHour = Math.min(22, minHour + 9);
    }

    canvas.width = 1600;
    canvas.height = 1200;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = "#FAF8F5";
    ctx.fillRect(0, 0, width, height);

    // Barra superior del título principal
    ctx.fillStyle = "#4A3B32";
    ctx.fillRect(0, 0, width, 80);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 26px 'Segoe UI', sans-serif";
    ctx.fillText("HORARIO ACADÉMICO — UNIVERSIDAD NACIONAL", 40, 50);

    const totalHours = maxHour - minHour; 
    
    const startY = 160; 
    const gridHeight = 980;
    const hourHeight = gridHeight / totalHours; 

    const hourColWidth = 120; 
    const numDias = diasActivos.length;
    const dayColWidth = (width - hourColWidth - 60) / numDias;
    const startX = 40;

    diasActivos.forEach((dia, index) => {
        let x = startX + hourColWidth + (index * dayColWidth);

        ctx.fillStyle = "#D4B59D";
        ctx.fillRect(x, 105, dayColWidth - 10, 40);

        ctx.fillStyle = "#2C221E";
        ctx.font = "bold 15px 'Segoe UI', sans-serif";
        ctx.fillText(dia, x + 15, 131);
    });

    for (let i = 0; i <= totalHours; i++) {
        let currentH = minHour + i;
        let y = startY + (i * hourHeight);

        ctx.strokeStyle = "#E2D4C8";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(width - startX, y);
        ctx.stroke();

        if (i < totalHours) {
            let label = currentH < 12 ? `${currentH}:00 AM` : (currentH === 12 ? `12:00 M` : `${currentH - 12}:00 PM`);
            ctx.fillStyle = "#665C54";
            ctx.font = "bold 13px 'Segoe UI', sans-serif";
            ctx.fillText(label, startX + 15, y + 22);
        }
    }

    diasActivos.forEach((dia, index) => {
        let x = startX + hourColWidth + (index * dayColWidth);

        ctx.strokeStyle = "#E2D4C8";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.lineTo(x, startY + gridHeight);
        ctx.stroke();
    });

    diasActivos.forEach((dia, index) => {
        let xBase = startX + hourColWidth + (index * dayColWidth);
        let clasesDia = horario[dia] || [];

        clasesDia.forEach((clase, idx) => {
            clase.colIndex = 0;
            clase.totalCols = 1;

            for (let j = 0; j < clasesDia.length; j++) {
                if (idx !== j) {
                    let otra = clasesDia[j];
                    if (clase.minInicio < otra.minFin && clase.minFin > otra.minInicio) {
                        if (idx > j) {
                            clase.colIndex = 1;
                            clase.totalCols = 2;
                            otra.totalCols = 2;
                        }
                    }
                }
            }
        });

        clasesDia.forEach(clase => {
            let actualColWidth = (dayColWidth - 14) / clase.totalCols;
            let x = xBase + 2 + (clase.colIndex * actualColWidth);

            let minutosDesdeInicioTotal = clase.minInicio - (minHour * 60);
            let duracionMinutos = clase.minFin - clase.minInicio;

            let yClase = startY + (minutosDesdeInicioTotal / 60) * hourHeight;
            let alturaClase = (duracionMinutos / 60) * hourHeight;

            ctx.fillStyle = "#FFF9F0";
            ctx.beginPath();
            ctx.roundRect(x, yClase + 2, actualColWidth - 4, alturaClase - 4, 6);
            ctx.fill();
            
            ctx.strokeStyle = "#C2A892";
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.fillStyle = "#8C5E35";
            ctx.font = "bold 10px 'Segoe UI', sans-serif";
            ctx.fillText(`${clase.inicio}-${clase.fin}`, x + 6, yClase + 16);

            ctx.fillStyle = "#333333";
            ctx.font = "9px 'Segoe UI', sans-serif";

            let words = clase.detalle.split(' ');
            let line = "";
            let textY = yClase + 28;

            for (let n = 0; n < words.length; n++) {
                let testLine = line + words[n] + " ";
                if (ctx.measureText(testLine).width > actualColWidth - 12 && n > 0) {
                    if (textY + 10 < yClase + alturaClase - 4) {
                        ctx.fillText(line, x + 6, textY);
                    }
                    line = words[n] + " ";
                    textY += 10;
                } else {
                    line = testLine;
                }
            }
            if (textY < yClase + alturaClase - 4) {
                ctx.fillText(line, x + 6, textY);
            }
        });
    });

    const downloadArea = document.getElementById('downloadArea');
    const dataURL = canvas.toDataURL('image/png');
    downloadArea.innerHTML = `<a href="${dataURL}" download="horario_personalizado.png" class="btn-download">📥 Descargar Mi Horario Organizado</a>`;
}
