// server.js
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const OpenAI = require('openai');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

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

// Main processing endpoint
app.post('/api/process-report', upload.any(), async (req, res) => {
  try {
    const files = req.files || [];
    let audioTranscription = '';
    let fileAnalyses = [];

    // Process audio transcription if audio file exists
    const audioFile = files.find(file => file.fieldname === 'audio');
    if (audioFile) {
      try {
        // Save audio temporarily for OpenAI processing
        const tempAudioPath = path.join(__dirname, 'temp', `audio_${Date.now()}.wav`);
        
        // Ensure temp directory exists
        if (!fs.existsSync(path.dirname(tempAudioPath))) {
          fs.mkdirSync(path.dirname(tempAudioPath), { recursive: true });
        }
        
        fs.writeFileSync(tempAudioPath, audioFile.buffer);

        // Transcribe audio using Whisper
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tempAudioPath),
          model: "whisper-1",
          language: "it"
        });

        audioTranscription = transcription.text;

        // Clean up temp file
        fs.unlinkSync(tempAudioPath);
      } catch (error) {
        console.error('Audio transcription error:', error);
        audioTranscription = '[Errore nella trascrizione audio]';
      }
    }

    // Analyze uploaded files
    const otherFiles = files.filter(file => file.fieldname !== 'audio');
    fileAnalyses = otherFiles.map(getFileAnalysis);

    // Prepare context for GPT analysis
    const analysisContext = `
    CONTESTO: Analisi di un problema professionale riportato da un operatore/tecnico.
    
    TRASCRIZIONE AUDIO: "${audioTranscription}"
    
    FILE ALLEGATI: ${fileAnalyses.map(f => `- ${f.name} (${f.type})`).join('\n')}
    
    COMPITO: Analizza il problema descritto e fornisci:
    1. Una descrizione chiara del problema identificato
    2. La soluzione che l'operatore ha già applicato (se menzionata)
    3. Raccomandazioni aggiuntive per risolvere completamente il problema
    4. Un riepilogo professionale per il management
    
    Rispondi in formato JSON con questa struttura:
    {
      "problemDescription": "descrizione del problema",
      "userSolution": "soluzione applicata dall'operatore o null se non menzionata",
      "recommendations": ["raccomandazione1", "raccomandazione2", ...],
      "managementSummary": "riepilogo per il management"
    }
    `;

    // Get AI analysis
    let aiAnalysis = {
      problemDescription: "Problema generico rilevato",
      userSolution: null,
      recommendations: ["Approfondire l'analisi", "Monitorare la situazione"],
      managementSummary: "Problema segnalato e in fase di risoluzione"
    };

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "Sei un assistente esperto nell'analisi di problemi tecnici e professionali. Rispondi sempre in italiano e fornisci analisi dettagliate e professionali."
          },
          {
            role: "user",
            content: analysisContext
          }
        ],
        temperature: 0.3
      });

      const analysisText = completion.choices[0].message.content;
      
      // Try to parse JSON response
      try {
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiAnalysis = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error('JSON parsing error:', parseError);
        // Keep default analysis if parsing fails
      }
    } catch (error) {
      console.error('OpenAI API error:', error);
      // Keep default analysis if API fails
    }

    // Prepare response
    const report = {
      timestamp: new Date().toISOString(),
      audioTranscription: audioTranscription,
      filesAnalyzed: fileAnalyses,
      problemDescription: aiAnalysis.problemDescription,
      userSolution: aiAnalysis.userSolution,
      aiRecommendations: aiAnalysis.recommendations,
      managementSummary: aiAnalysis.managementSummary
    };

    res.json({ success: true, report });

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

    // AI Recommendations
    if (report.aiRecommendations && report.aiRecommendations.length > 0) {
      doc.fontSize(16).text('RACCOMANDAZIONI AGGIUNTIVE:', { underline: true });
      doc.moveDown(0.5);
      report.aiRecommendations.forEach((rec, index) => {
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