# Professional Problem Reporter

Una web application completa per la documentazione professionale di problemi lavorativi, integrata con AI per l'analisi automatica e la generazione di report PDF.

## 🚀 Caratteristiche Principali

- **Upload Multimediale**: Drag & drop per immagini, video, PDF e documenti Word
- **Registrazione Audio**: Interfaccia intuitiva per registrare descrizioni del problema
- **Analisi AI**: Integrazione con OpenAI (Whisper per trascrizione + GPT-4 per analisi)
- **Report PDF**: Generazione automatica di report professionali
- **Interface Responsive**: Design moderno e user-friendly

## 🛠️ Tecnologie Utilizzate

### Frontend
- **React** con Hooks moderni
- **Tailwind CSS** per lo styling
- **Lucide React** per le icone
- **Web Audio API** per la registrazione

### Backend
- **Node.js** con Express
- **OpenAI API** (Whisper + GPT-4)
- **Multer** per l'upload dei file
- **PDFKit** per la generazione PDF
- **CORS** per le richieste cross-origin

## 📦 Installazione

### Prerequisiti
- Node.js >= 16.0.0
- npm >= 8.0.0
- Chiave API di OpenAI

### Setup del Progetto

1. **Clona il repository**:
```bash
git clone <repository-url>
cd professional-problem-reporter
```

2. **Installa le dipendenze**:
```bash
npm install
```

3. **Configura le variabili d'ambiente**:
```bash
cp .env.example .env
```

Modifica il file `.env` con le tue configurazioni:
```env
OPENAI_API_KEY=your_openai_api_key_here
PORT=3001
NODE_ENV=development
```

4. **Crea la struttura delle cartelle**:
```bash
mkdir temp
mkdir client/public
mkdir client/src
```

### Setup del Frontend (React)

1. **Crea l'app React**:
```bash
npx create-react-app client
cd client
npm install lucide-react
```

2. **Sostituisci il contenuto di `client/src/App.js`** con il componente React fornito.

3. **Aggiorna `client/src/index.css`** per includere Tailwind:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

4. **Installa e configura Tailwind CSS**:
```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Aggiorna `tailwind.config.js`:
```javascript
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

## 🚀 Avvio dell'Applicazione

### Metodo 1: Avvio Separato

**Terminal 1 - Backend**:
```bash
npm run dev
```

**Terminal 2 - Frontend**:
```bash
cd client
npm start
```

### Metodo 2: Avvio Simultaneo
```bash
npm run dev:full
```

L'applicazione sarà disponibile su:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

## 📋 Utilizzo

### 1. Caricamento File
- Trascina i file nella zona di drop o clicca per selezionare
- Supporta: Immagini, Video, PDF, Word (max 50MB per file)
- Visualizzazione lista file caricati con opzione di rimozione

### 2. Registrazione Audio
- Clicca "Inizia Registrazione" (richiede permessi microfono)
- Descrivi il problema e eventualmente la soluzione applicata
- Clicca "Ferma Registrazione" quando finito
- Ascolta l'anteprima e cancella se necessario

### 3. Generazione Report
- Clicca "Genera Report" per avviare l'analisi AI
- Il sistema:
  - Trascrive l'audio con Whisper
  - Analizza il problema con GPT-4
  - Identifica soluzioni proposte dall'utente
  - Fornisce raccomandazioni aggiuntive

### 4. Download PDF
- Visualizza il report generato
- Clicca "Scarica Report PDF" per il download
- Il PDF include tutti i dettagli professionali

## 🔧 API Endpoints

### POST `/api/process-report`
Elabora file e audio per generare il report.

**Request**: FormData con file e audio
**Response**: 
```json
{
  "success": true,
  "report": {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "audioTranscription": "Testo trascritto...",
    "problemDescription": "Descrizione del problema...",
    "userSolution": "Soluzione applicata...",
    "aiRecommendations": ["Raccomandazione 1", "..."],
    "managementSummary": "Riepilogo per il management...",
    "filesAnalyzed": [...]
  }
}
```

### POST `/api/generate-pdf`
Genera e scarica il report PDF.

**Request**: 
```json
{
  "report": { /* oggetto report */ }
}
```

**Response**: File PDF binario

### GET `/api/health`
Controllo stato del server.

## 🔒 Sicurezza e Limitazioni

### Limitazioni File
- Dimensione massima: 50MB per file
- Formati supportati: 
  - Immagini: JPEG, PNG, GIF, WebP
  - Video: MP4, WebM, QuickTime
  - Documenti: PDF, DOC, DOCX

### Sicurezza
- Validazione tipi file
- Limitazioni dimensioni upload
- Sanitizzazione input
- CORS configurato
- Rate limiting (configurabile)

## 🌐 Deploy

### Deploy su Heroku
```bash
# Installa Heroku CLI
heroku create your-app-name
heroku config:set OPENAI_API_KEY=your_key
git push heroku main
```

### Deploy su Vercel (Serverless)
```bash
npm install -g vercel
vercel
# Configura le variabili d'ambiente nel dashboard
```

### Deploy su DigitalOcean/AWS
1. Configura un server Node.js
2. Installa PM2 per il process management
3. Configura nginx come reverse proxy
4. Setup SSL con Let's Encrypt

## 🧪 Testing

### Test Backend
```bash
# Test endpoint health
curl http://localhost:3001/api/health

# Test upload (con file)
curl -X POST -F "audio=@test.wav" -F "file_0=@test.pdf" \
  http://localhost:3001/api/process-report
```

### Test Frontend
- Verifica upload file
- Test registrazione audio
- Controllo generazione PDF
- Test responsive design

## 🔧 Personalizzazione

### Modificare il Prompt AI
Edita la variabile `analysisContext` in `server.js` per personalizzare l'analisi AI:

```javascript
const analysisContext = `
CONTESTO: [Il tuo contesto personalizzato]
// Personalizza il prompt per il tuo settore specifico
`;
```

### Styling personalizzato
Modifica le classi Tailwind nel componente React o aggiungi CSS custom in `client/src/index.css`.

### Aggiungere nuovi tipi di file
Estendi l'array `validTypes` nella funzione `handleFileUpload` e aggiorna la logica di analisi nel backend.

## 🐛 Troubleshooting

### Problemi Comuni

**Errore CORS**:
- Verifica che il backend sia su porta 3001
- Controlla la configurazione CORS in `server.js`

**Errore registrazione audio**:
- Verifica permessi microfono nel browser
- Testa su HTTPS in produzione

**Errore OpenAI API**:
- Controlla la chiave API nel file `.env`
- Verifica crediti disponibili su OpenAI

**Errore generazione PDF**:
- Controlla che PDFKit sia installato correttamente
- Verifica lo spazio su disco per file temporanei

## 📞 Supporto

Per supporto e bug report:
1. Controlla la documentazione
2. Verifica i log del server (`console.log`)
3. Testa gli endpoint API individualmente
4. Controlla le variabili d'ambiente

## 📝 Licenza

MIT License - Vedi file LICENSE per dettagli.

## 🚀 Roadmap Future

- [ ] Autenticazione utenti
- [ ] Database per storico report
- [ ] Template report personalizzabili
- [ ] Integrazione con sistemi aziendali
- [ ] App mobile companion
- [ ] Analisi predittiva dei guasti
- [ ] Dashboard analytics per manager