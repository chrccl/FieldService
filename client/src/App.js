import React, { useState, useRef, useCallback } from 'react';
import { Upload, Mic, MicOff, FileText, Download, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

const ProfessionalProblemReporter = () => {
  const [files, setFiles] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);

  // Drag & Drop handlers
  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFileUpload(droppedFiles);
  }, []);

  const handleFileUpload = (newFiles) => {
    const validFiles = Array.from(newFiles).filter(file => {
      const validTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/webm', 'video/quicktime',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      return validTypes.includes(file.type) || file.size < 50 * 1024 * 1024; // 50MB limit
    });

    setFiles(prevFiles => [...prevFiles, ...validFiles]);
    setError('');
  };

  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  // Audio recording handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setAudioBlob(audioBlob);
        setAudioUrl(URL.createObjectURL(audioBlob));
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setError('');
    } catch (err) {
      setError('Errore nell\'accesso al microfono. Assicurati di aver dato i permessi.');
      console.error('Error accessing microphone:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const clearAudio = () => {
    setAudioBlob(null);
    setAudioUrl('');
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
  };

  // Process files and audio
  const processReport = async () => {
    if (!audioBlob && files.length === 0) {
      setError('Carica almeno un file o registra un messaggio audio per procedere.');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      // Create FormData for API call
      const formData = new FormData();
      
      // Add audio file if exists
      if (audioBlob) {
        formData.append('audio', audioBlob, 'recording.wav');
      }
      
      // Add other files
      files.forEach((file, index) => {
        formData.append(`file_${index}`, file);
      });

      // In a real implementation, this would call your backend API
      // For demo purposes, we'll simulate the API response
      await simulateAPICall(formData);
      
    } catch (err) {
      setError('Errore durante l\'elaborazione. Riprova più tardi.');
      console.error('Processing error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Call backend API
  const simulateAPICall = async (formData) => {
    try {
      const response = await fetch('http://localhost:3001/api/process-report', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setReport(data.report);
      } else {
        throw new Error(data.error || 'Errore sconosciuto dal server');
      }
    } catch (error) {
      console.error('API call error:', error);
      throw new Error('Errore di connessione al server. Verifica che il backend sia attivo.');
    }
  };

  // Generate PDF report
  const generatePDF = async () => {
    if (!report) return;
    
    try {
      const response = await fetch('http://localhost:3001/api/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ report })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Create blob from response
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      // Create download link
      const a = document.createElement('a');
      a.href = url;
      a.download = `report_professionale_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('PDF generation error:', error);
      setError('Errore durante la generazione del PDF. Verifica che il backend sia attivo.');
    }
  };

  const resetForm = () => {
    setFiles([]);
    setAudioBlob(null);
    setAudioUrl('');
    setReport(null);
    setError('');
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              Professional Problem Reporter
            </h1>
            <p className="text-gray-600">
              Documenta problemi professionali con file multimediali e descrizioni audio
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
              <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
              <span className="text-red-700">{error}</span>
            </div>
          )}

          {!report ? (
            <div className="space-y-8">
              {/* File Upload Section */}
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-800 flex items-center">
                  <Upload className="w-5 h-5 mr-2" />
                  Carica File Multimediali
                </h2>
                
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-2">
                    Trascina qui i tuoi file o clicca per selezionare
                  </p>
                  <p className="text-sm text-gray-500">
                    Supportati: Immagini, Video, PDF, Word (max 50MB ciascuno)
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*,.pdf,.doc,.docx"
                  onChange={(e) => handleFileUpload(e.target.files)}
                  className="hidden"
                />

                {files.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-medium text-gray-700">File caricati:</h3>
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                        <span className="text-sm text-gray-700 truncate">{file.name}</span>
                        <button
                          onClick={() => removeFile(index)}
                          className="text-red-500 hover:text-red-700 text-sm font-medium"
                        >
                          Rimuovi
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Audio Recording Section */}
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-800 flex items-center">
                  <Mic className="w-5 h-5 mr-2" />
                  Registrazione Audio
                </h2>
                
                <div className="bg-gray-50 rounded-lg p-6">
                  <div className="flex items-center justify-center space-x-4 mb-4">
                    {!isRecording ? (
                      <button
                        onClick={startRecording}
                        disabled={!!audioBlob}
                        className="flex items-center px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:bg-gray-400 transition-colors"
                      >
                        <Mic className="w-5 h-5 mr-2" />
                        Inizia Registrazione
                      </button>
                    ) : (
                      <button
                        onClick={stopRecording}
                        className="flex items-center px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors animate-pulse"
                      >
                        <MicOff className="w-5 h-5 mr-2" />
                        Ferma Registrazione
                      </button>
                    )}
                  </div>

                  {isRecording && (
                    <div className="text-center">
                      <div className="w-4 h-4 bg-red-500 rounded-full mx-auto animate-pulse mb-2"></div>
                      <p className="text-sm text-gray-600">Registrazione in corso...</p>
                    </div>
                  )}

                  {audioUrl && (
                    <div className="space-y-3">
                      <audio controls className="w-full">
                        <source src={audioUrl} type="audio/wav" />
                        Il tuo browser non supporta l'elemento audio.
                      </audio>
                      <button
                        onClick={clearAudio}
                        className="text-sm text-red-500 hover:text-red-700"
                      >
                        Cancella registrazione
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Process Button */}
              <div className="text-center">
                <button
                  onClick={processReport}
                  disabled={isProcessing || (!audioBlob && files.length === 0)}
                  className="flex items-center justify-center mx-auto px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors text-lg font-medium"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Elaborazione in corso...
                    </>
                  ) : (
                    <>
                      <FileText className="w-5 h-5 mr-2" />
                      Genera Report
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Report Display */
            <div className="space-y-6">
              <div className="flex items-center justify-center mb-6">
                <CheckCircle className="w-8 h-8 text-green-500 mr-2" />
                <h2 className="text-2xl font-bold text-green-700">Report Generato con Successo</h2>
              </div>

              <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Problema Identificato:</h3>
                  <p className="text-gray-700">{report.problemDescription}</p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Trascrizione Audio:</h3>
                  <p className="text-gray-700 italic">"{report.audioTranscription}"</p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Soluzione Applicata:</h3>
                  <p className="text-gray-700 font-medium">{report.userSolution}</p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Raccomandazioni AI:</h3>
                  <ul className="list-disc list-inside text-gray-700 space-y-1">
                    {report.aiRecommendations.map((rec, index) => (
                      <li key={index}>{rec}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">Riepilogo Gestionale:</h3>
                  <p className="text-gray-700">{report.managementSummary}</p>
                </div>

                {report.filesAnalyzed && report.filesAnalyzed.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">File Analizzati:</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      {report.filesAnalyzed.map((file, index) => (
                        <li key={index}>{file.name} ({file.type})</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex justify-center space-x-4">
                <button
                  onClick={generatePDF}
                  className="flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Download className="w-5 h-5 mr-2" />
                  Scarica Report PDF
                </button>
                <button
                  onClick={resetForm}
                  className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Nuovo Report
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfessionalProblemReporter;