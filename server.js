// server.js
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const OpenAI = require('openai');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const XLSX = require('xlsx');
const { Document, Paragraph, TextRun, Packer } = require('docx');
const mammoth = require('mammoth');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Helper function to analyze file content
const getFileAnalysis = (file) => {
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const fileType = file.mimetype;
  
  let category = 'document';
  if (fileType.startsWith('image/')) category = 'image';
  else if (fileType.startsWith('video/')) category = 'video';
  else if (fileType.includes('pdf')) category = 'pdf';
  
  return {
    name: file.originalname,
    type: category,
    size: file.size,
    extension: fileExtension
  };
};

// Helper function to extract text from images using OCR (via OpenAI Vision)
const extractTextFromImage = async (imageBuffer) => {
  try {
    // Convert image to base64
    const base64Image = imageBuffer.toString('base64');
    const mimeType = 'image/jpeg'; // or detect dynamically

    const response = await openai.chat.completions.create({
      // Use a supported vision model. For instance, “gpt-4o” (GPT-4o) or “gpt-4o-mini”
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Estrai tutto il testo visibile in questa immagine. Se ci sono tabelle, mantieni la struttura. Rispondi solo con il testo estratto, senza commenti aggiuntivi."
            },
            {
              // Embedding the image as base64 via data URL
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 1000
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Image text extraction error:', error);
    return "[Impossibile estrarre testo dall'immagine]";
  }
};


// Helper function to read Excel file
const readExcelFile = (buffer) => {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    return { workbook, worksheet, jsonData, sheetName };
  } catch (error) {
    console.error('Excel reading error:', error);
    return null;
  }
};

// Helper function to read Word file
const readWordFile = async (buffer) => {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    console.error('Word reading error:', error);
    return '[Impossibile leggere il documento Word]';
  }
};

// Main processing endpoint - SOSTITUISCI COMPLETAMENTE IL PRECEDENTE
app.post('/api/process-report', upload.any(), async (req, res) => {
  try {
    const files = req.files || [];
    let audioTranscription = '';
    let fileAnalyses = [];
    let extractedImageTexts = [];
    let excelFile = null;
    let wordFile = null;
    let wordContent = '';

    // Process audio transcription if audio file exists
    const audioFile = files.find(file => file.fieldname === 'audio');
    if (audioFile) {
      try {
        const tempAudioPath = path.join(__dirname, 'temp', `audio_${Date.now()}.wav`);
        
        if (!fs.existsSync(path.dirname(tempAudioPath))) {
          fs.mkdirSync(path.dirname(tempAudioPath), { recursive: true });
        }
        
        fs.writeFileSync(tempAudioPath, audioFile.buffer);

        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tempAudioPath),
          model: "whisper-1",
          language: "it"
        });

        audioTranscription = transcription.text;
        fs.unlinkSync(tempAudioPath);
      } catch (error) {
        console.error('Audio transcription error:', error);
        audioTranscription = '[Errore nella trascrizione audio]';
      }
    }

    // Process other files
    const otherFiles = files.filter(file => file.fieldname !== 'audio');
    
    for (const file of otherFiles) {
      const analysis = getFileAnalysis(file);
      fileAnalyses.push(analysis);

      // Handle different file types
      if (file.mimetype.startsWith('image/')) {
        // Extract text from images
        const extractedText = await extractTextFromImage(file.buffer);
        extractedImageTexts.push({
          filename: file.originalname,
          extractedText: extractedText
        });
      } else if (file.mimetype.includes('spreadsheet') || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
        // Store Excel file for modification
        excelFile = {
          originalname: file.originalname,
          buffer: file.buffer,
          data: readExcelFile(file.buffer)
        };
      } else if (file.mimetype.includes('document') || file.originalname.endsWith('.docx') || file.originalname.endsWith('.doc')) {
        // Store Word file for modification
        wordContent = await readWordFile(file.buffer);
        wordFile = {
          originalname: file.originalname,
          buffer: file.buffer,
          content: wordContent
        };
      }
    }

    // Determine the type of operation based on files
    const hasExcel = !!excelFile;
    const hasWord = !!wordFile;
    const hasImages = extractedImageTexts.length > 0;

    if (hasExcel || hasWord) {
      // File modification mode
      let modificationContext = '';
      let fileToModify = null;
      let fileType = '';

      if (hasExcel) {
        fileType = 'excel';
        fileToModify = excelFile;
        const currentData = excelFile.data.jsonData.map(row => row.join(' | ')).join('\n');
        modificationContext = `
        TIPO OPERAZIONE: Modifica file Excel
        CONTENUTO ATTUALE EXCEL:
        ${currentData}
        
        TRASCRIZIONE AUDIO: "${audioTranscription}"
        
        TESTI ESTRATTI DA IMMAGINI: ${extractedImageTexts.map(img => `${img.filename}: ${img.extractedText}`).join('\n')}
        
        COMPITO: Analizza i dati forniti e modifica il file Excel. Aggiungi/completa i dati mancanti basandoti su:
        1. Le istruzioni audio dell'utente
        2. I dati estratti dalle immagini
        3. Logica e coerenza con i dati esistenti
        
        Rispondi in formato JSON con:
        {
          "modificationType": "excel",
          "newData": [["Col1", "Col2", "Col3"], ["Dato1", "Dato2", "Dato3"], ...],
          "modifications": "Descrizione delle modifiche apportate",
          "summary": "Riepilogo per l'utente"
        }
        `;
      } else if (hasWord) {
        fileType = 'word';
        fileToModify = wordFile;
        modificationContext = `
        TIPO OPERAZIONE: Modifica documento Word
        CONTENUTO ATTUALE WORD:
        ${wordContent}
        
        TRASCRIZIONE AUDIO: "${audioTranscription}"
        
        TESTI ESTRATTI DA IMMAGINI: ${extractedImageTexts.map(img => `${img.filename}: ${img.extractedText}`).join('\n')}
        
        COMPITO: Analizza il documento e completa/modifica il contenuto basandoti su:
        1. Le istruzioni audio dell'utente
        2. I dati estratti dalle immagini
        3. Continuità e coerenza con il testo esistente
        
        Rispondi in formato JSON con:
        {
          "modificationType": "word",
          "newContent": "Contenuto completo del documento modificato",
          "modifications": "Descrizione delle modifiche apportate",
          "summary": "Riepilogo per l'utente"
        }
        `;
      }

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: "Sei un assistente esperto nella modifica di documenti. Rispondi sempre in italiano e fornisci modifiche precise e professionali."
            },
            {
              role: "user",
              content: modificationContext
            }
          ],
          temperature: 0.3
        });

        const analysisText = completion.choices[0].message.content;
        let modification = {};
        
        try {
          const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            modification = JSON.parse(jsonMatch[0]);
          }
        } catch (parseError) {
          console.error('JSON parsing error:', parseError);
          throw new Error('Errore nell\'analisi della risposta AI');
        }

        // Generate modified file
        let modifiedFileBuffer;
        let filename;

        if (fileType === 'excel') {
          // Create new Excel file
          const newWorkbook = XLSX.utils.book_new();
          const newWorksheet = XLSX.utils.aoa_to_sheet(modification.newData);
          XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, 'Foglio1');
          modifiedFileBuffer = XLSX.write(newWorkbook, { type: 'buffer', bookType: 'xlsx' });
          filename = `modified_${Date.now()}.xlsx`;
        } else if (fileType === 'word') {
          // Create new Word document
          const doc = new Document({
            sections: [{
              properties: {},
              children: modification.newContent.split('\n').map(line => 
                new Paragraph({
                  children: [new TextRun(line)]
                })
              )
            }]
          });
          modifiedFileBuffer = await Packer.toBuffer(doc);
          filename = `modified_${Date.now()}.docx`;
        }

        const report = {
          timestamp: new Date().toISOString(),
          type: 'file_modification',
          fileType: fileType,
          audioTranscription: audioTranscription,
          extractedImageTexts: extractedImageTexts,
          modifications: modification.modifications,
          summary: modification.summary,
          originalFilename: fileToModify.originalname,
          modifiedFilename: filename,
          modifiedFileBuffer: modifiedFileBuffer.toString('base64')
        };

        res.json({ success: true, report });

      } catch (error) {
        console.error('File modification error:', error);
        throw error;
      }

    } else {
      // Original report generation mode
      const analysisContext = `
      CONTESTO: Analisi di un problema professionale riportato da un operatore/tecnico.

      TRASCRIZIONE AUDIO: "${audioTranscription}"

      FILE ALLEGATI: ${fileAnalyses.map(f => `- ${f.name} (${f.type})`).join('\n')}

      TESTI ESTRATTI DA IMMAGINI: ${extractedImageTexts.map(img => `${img.filename}: ${img.extractedText}`).join('\n')}

      ISTRUZIONI DETTAGLIATE:
      Fornisci un'analisi professionale e completa che includa:

      1. IDENTIFICAZIONE DEL PROBLEMA:
        - Descrizione tecnica dettagliata
        - Cause probabili (primarie e secondarie)
        - Impatto operativo e conseguenze
        - Classificazione del livello di criticità

      2. ANALISI DELLA SOLUZIONE APPLICATA:
        - Valutazione dell'efficacia della soluzione dell'operatore
        - Eventuali rischi o limitazioni
        - Suggerimenti per ottimizzazioni

      3. SOLUZIONI RACCOMANDATE (almeno 2-3 opzioni):
        Per ogni soluzione fornisci:
        - Descrizione tecnica completa (minimo 100 parole)
        - Passaggi operativi specifici e dettagliati
        - Materiali/strumenti necessari con specifiche tecniche
        - Tempo di implementazione realistico
        - Costi stimati (quando applicabile)
        - Livello di competenza richiesto
        - Rischi associati e precauzioni di sicurezza
        - Verifiche post-implementazione

      4. ANALISI PREVENTIVA:
        - Cause radice del problema
        - Strategie di prevenzione specifiche
        - Controlli periodici raccomandati
        - Indicatori di allarme precoce

      5. IMPATTO AZIENDALE:
        - Analisi costi-benefici
        - Tempo di fermo operativo
        - Risorse necessarie
        - Priorità di intervento

      Rispondi in formato JSON con questa struttura:
      {
        "problemDescription": "descrizione del problema",
        "userSolution": "soluzione applicata dall'operatore o null se non menzionata",
        "detailedSolutions": [
          {
            "title": "Titolo della soluzione",
            "description": "Descrizione dettagliata",
            "steps": ["Passo 1", "Passo 2", "Passo 3"],
            "priority": "alta/media/bassa",
            "estimatedTime": "tempo stimato",
            "requiredTools": ["strumento1", "strumento2"]
          }
        ],
        "preventiveRecommendations": ["raccomandazione1", "raccomandazione2"],
        "managementSummary": "riepilogo per il management"
      }
      `;

      let aiAnalysis = {
        problemDescription: "Problema generico rilevato",
        userSolution: null,
        detailedSolutions: [
          {
            title: "Soluzione generica",
            description: "Analisi più approfondita necessaria",
            steps: ["Identificare la causa", "Applicare correzione", "Verificare risultato"],
            priority: "media",
            estimatedTime: "30-60 minuti",
            requiredTools: ["Strumenti standard"]
          }
        ],
        preventiveRecommendations: ["Monitorare la situazione", "Controlli periodici"],
        managementSummary: "Problema segnalato e in fase di risoluzione"
      };

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: "Sei un assistente esperto nell'analisi di problemi tecnici e professionali. Rispondi sempre in italiano e fornisci analisi dettagliate, esaustive e professionali."
            },
            {
              role: "user",
              content: analysisContext
            }
          ],
          temperature: 0.3
        });

        const analysisText = completion.choices[0].message.content;
        
        try {
          const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            aiAnalysis = JSON.parse(jsonMatch[0]);
          }
        } catch (parseError) {
          console.error('JSON parsing error:', parseError);
        }
      } catch (error) {
        console.error('OpenAI API error:', error);
      }

      const report = {
        timestamp: new Date().toISOString(),
        type: 'problem_report',
        audioTranscription: audioTranscription,
        extractedImageTexts: extractedImageTexts,
        filesAnalyzed: fileAnalyses,
        problemDescription: aiAnalysis.problemDescription,
        userSolution: aiAnalysis.userSolution,
        detailedSolutions: aiAnalysis.detailedSolutions,
        preventiveRecommendations: aiAnalysis.preventiveRecommendations,
        managementSummary: aiAnalysis.managementSummary
      };

      res.json({ success: true, report });
    }

  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Errore durante l\'elaborazione del report' 
    });
  }
});

// PDF Generation endpoint
app.post('/api/generate-pdf', express.json(), async (req, res) => {
  try {
    const { report } = req.body;
    
    if (!report) {
      return res.status(400).json({ error: 'Report data required' });
    }

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });
    const filename = `report_${Date.now()}.pdf`;
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Pipe PDF to response
    doc.pipe(res);

    // PDF Content
    doc.fontSize(20).text('REPORT PROFESSIONALE', { align: 'center' });
    doc.moveDown();
    
    doc.fontSize(12).text(`Data: ${new Date(report.timestamp).toLocaleDateString('it-IT')}`, { align: 'right' });
    doc.moveDown(2);

    // Problem Description
    doc.fontSize(16).text('PROBLEMA IDENTIFICATO:', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).text(report.problemDescription, { align: 'justify' });
    doc.moveDown(2);

    // Audio Transcription
    if (report.audioTranscription) {
      doc.fontSize(16).text('DESCRIZIONE DELL\'OPERATORE:', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12).text(`"${report.audioTranscription}"`, { align: 'justify', italics: true });
      doc.moveDown(2);
    }

    // User Solution
    if (report.userSolution) {
      doc.fontSize(16).text('SOLUZIONE APPLICATA:', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12).text(report.userSolution, { align: 'justify' });
      doc.moveDown(2);
    }

    // Detailed Solutions
    if (report.detailedSolutions && report.detailedSolutions.length > 0) {
      doc.fontSize(16).text('SOLUZIONI RACCOMANDATE:', { underline: true });
      doc.moveDown(0.5);
      
      report.detailedSolutions.forEach((solution, index) => {
        doc.fontSize(14).text(`${index + 1}. ${solution.title}`, { underline: true });
        doc.moveDown(0.3);
        
        doc.fontSize(12).text(`Priorità: ${solution.priority.toUpperCase()}`, { continued: true });
        doc.text(` | Tempo stimato: ${solution.estimatedTime}`, { align: 'left' });
        doc.moveDown(0.3);
        
        doc.fontSize(12).text('Descrizione:', { underline: true });
        doc.text(solution.description, { align: 'justify' });
        doc.moveDown(0.3);
        
        if (solution.steps && solution.steps.length > 0) {
          doc.fontSize(12).text('Passaggi:', { underline: true });
          solution.steps.forEach((step, stepIndex) => {
            doc.text(`   ${stepIndex + 1}. ${step}`);
          });
          doc.moveDown(0.3);
        }
        
        if (solution.requiredTools && solution.requiredTools.length > 0) {
          doc.fontSize(12).text('Strumenti necessari:', { underline: true });
          doc.text(`   ${solution.requiredTools.join(', ')}`);
          doc.moveDown(0.3);
        }
        
        doc.moveDown(1);
      });
      doc.moveDown(1);
    }

    // AI Recommendations
    if (report.preventiveRecommendations && report.preventiveRecommendations.length > 0) {
      doc.fontSize(16).text('RACCOMANDAZIONI PREVENTIVE:', { underline: true });
      doc.moveDown(0.5);
      report.preventiveRecommendations.forEach((rec, index) => {
        doc.fontSize(12).text(`${index + 1}. ${rec}`, { align: 'justify' });
        doc.moveDown(0.3);
      });
      doc.moveDown(1);
}

    // Management Summary
    if (report.managementSummary) {
      doc.fontSize(16).text('RIEPILOGO GESTIONALE:', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12).text(report.managementSummary, { align: 'justify' });
      doc.moveDown(2);
    }

    // Files Analyzed
    if (report.filesAnalyzed && report.filesAnalyzed.length > 0) {
      doc.fontSize(16).text('FILE ALLEGATI:', { underline: true });
      doc.moveDown(0.5);
      report.filesAnalyzed.forEach((file, index) => {
        doc.fontSize(12).text(`${index + 1}. ${file.name} (${file.type})`, { align: 'left' });
        doc.moveDown(0.3);
      });
    }

    // Footer
    doc.moveDown(3);
    doc.fontSize(10).text('Report generato automaticamente dal sistema Professional Problem Reporter', 
      { align: 'center', color: 'grey' });

    // Finalize PDF
    doc.end();

  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: 'Errore durante la generazione del PDF' });
  }
});

app.post('/api/download-modified-file', express.json(), async (req, res) => {
  try {
    const { report } = req.body;
    
    if (!report || !report.modifiedFileBuffer) {
      return res.status(400).json({ error: 'File data required' });
    }

    const fileBuffer = Buffer.from(report.modifiedFileBuffer, 'base64');
    const filename = report.modifiedFilename;
    
    // Determine content type
    let contentType = 'application/octet-stream';
    if (filename.endsWith('.xlsx')) {
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (filename.endsWith('.docx')) {
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    // Set response headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    
    // Send file
    res.send(fileBuffer);

  } catch (error) {
    console.error('File download error:', error);
    res.status(500).json({ error: 'Errore durante il download del file' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Errore interno del server' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;