from flask import Flask, request, jsonify, render_template
import subprocess
import sys
import json
import traceback
import io
import contextlib

app = Flask(__name__)

class PythonSession:
    def __init__(self):
        self.process = None
        self.start_session()
    
    def start_session(self):
        script = '''
import sys
import json
import traceback
import io
import contextlib

globals_dict = {}

def run_code(code, cell_id):
    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()
    
    output = ""
    error = ""
    
    try:
        with contextlib.redirect_stdout(stdout_capture), contextlib.redirect_stderr(stderr_capture):
            exec(code, globals_dict)
        output = stdout_capture.getvalue()
        err_output = stderr_capture.getvalue()
        if err_output:
            error = err_output
    except Exception as e:
        error = traceback.format_exc()
    
    result = {
        "cell_id": cell_id,
        "output": output,
        "error": error
    }
    sys.stdout.write(json.dumps(result) + "\\n")
    sys.stdout.flush()

while True:
    try:
        line = sys.stdin.readline()
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        data = json.loads(line)
        code = data.get("code", "")
        cell_id = data.get("cell_id", 0)
        run_code(code, cell_id)
    except json.JSONDecodeError as e:
        sys.stdout.write(json.dumps({"cell_id": 0, "output": "", "error": f"JSON decode error: {e}"}) + "\\n")
        sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(json.dumps({"cell_id": 0, "output": "", "error": str(e)}) + "\\n")
        sys.stdout.flush()
'''
        self.process = subprocess.Popen(
            [sys.executable, '-u', '-c', script],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
    
    def execute(self, code, cell_id):
        if self.process.poll() is not None:
            self.start_session()
        
        try:
            request_data = json.dumps({"code": code, "cell_id": cell_id})
            self.process.stdin.write(request_data + "\n")
            self.process.stdin.flush()
            
            response_line = self.process.stdout.readline()
            if response_line:
                return json.loads(response_line.strip())
            return {"cell_id": cell_id, "output": "", "error": "No response from Python process"}
        except json.JSONDecodeError as e:
            self.start_session()
            return {"cell_id": cell_id, "output": "", "error": f"JSON decode error: {e}"}
        except Exception as e:
            self.start_session()
            return {"cell_id": cell_id, "output": "", "error": str(e)}
    
    def restart(self):
        if self.process:
            self.process.terminate()
            try:
                self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
        self.start_session()
        return {"status": "restarted"}

session = PythonSession()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/run", methods=["POST"])
def run_code():
    data = request.get_json()
    code = data.get("code", "")
    cell_id = data.get("cell_id", 0)
    result = session.execute(code, cell_id)
    return jsonify(result)

@app.route("/restart", methods=["POST"])
def restart_session():
    result = session.restart()
    return jsonify(result)

import os

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=False, host="0.0.0.0", port=port)