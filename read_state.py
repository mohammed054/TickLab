with open('STATE.md', 'rb') as f:
    raw = f.read()
text = raw.decode('utf-16', errors='replace')
print(text[:6000])