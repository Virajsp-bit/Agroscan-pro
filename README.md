To run the AgroScan Pro application, follow these steps to start both the backend (AI Model) and the frontend (Visual Interface).

1. Start the Backend (FastAPI + AI Model)
Open a new terminal and navigate to the backend directory:

powershell
# Navigate to backend if not already there
cd d:\Games\Agroscan\backend
# Activate the virtual environment you just created
.\venv\Scripts\activate
# Install the required dependencies
pip install -r requirements.txt
# Run the server
python main.py
Wait for the message: INFO: Uvicorn running on http://0.0.0.0:8000.

2. Start the Frontend (Vite + React)
Open another terminal window and run the dashboard from the root directory:

powershell
# Navigate to the project root
cd d:\Games\Agroscan
# Install web dependencies (if first time)
npm install
# Start the dev server(on another terminal)
npm run dev
How to use:
Once both are running, open the Local URL provided by the frontend terminal (usually http://localhost:3000).
Upload an image of a Chilli leaf.
The app will send the image to http://localhost:8000/analyze, where the Densenet ML Model will process it and return the diagnosis.
TIP

Check Backend Health: You can visit http://localhost:8000/ in your browser. It should return a JSON message saying "AgroScan Pro Backend is running".