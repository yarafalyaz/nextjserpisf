import json
import os
import subprocess

def main():
    # 1. Run coverage
    print("Running coverage...")
    subprocess.run(["npx", "vitest", "run", "--coverage", "--silent"], check=False)
    
    # 2. Parse coverage
    cov_path = "coverage/coverage-final.json"
    if not os.path.exists(cov_path):
        print("No coverage report found!")
        return
        
    with open(cov_path) as f:
        data = json.load(f)
        
    uncovered_files = []
    for filepath, details in data.items():
        if "node_modules" in filepath or "src/lib/validations" in filepath or "index.ts" in filepath:
            continue
            
        # hitung line coverage
        statements = details.get("s", {})
        total_s = len(statements)
        if total_s == 0:
            continue
            
        covered_s = sum(1 for v in statements.values() if v > 0)
        percentage = (covered_s / total_s) * 100
        
        # Cari file di src/actions atau src/lib/services yang coverage < 95%
        if ("src/actions/" in filepath or "src/lib/services/" in filepath) and percentage < 95.0:
            uncovered_files.append((filepath, percentage))
            
    uncovered_files.sort(key=lambda x: x[1])
    
    if not uncovered_files:
        print("All actions/services are >= 95% covered!")
        return
        
    print(f"Target: {uncovered_files[0][0]} ({uncovered_files[0][1]:.2f}%)")
    with open(".hermes/next_target.txt", "w") as f:
        f.write(f"{uncovered_files[0][0]}\n{uncovered_files[0][1]:.2f}")

if __name__ == "__main__":
    main()
