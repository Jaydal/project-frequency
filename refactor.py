import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Simple replacements for queue-service, queue-processor, etc
    content = content.replace("line1: '{court_name}', line2: '{match_info}', line3: 'GAME {timer}'", "pages: []")
    content = content.replace("line1: '{court_name}', line2: 'GET READY', line3: '{queue_count} WAITING'", "pages: []")
    # Actually just replace { line1, line2, line3 } with an empty payload or generatePayload call
    
    # Let's use sed-like replacements for the known errors.
    
    with open(filepath, 'w') as f:
        f.write(content)

