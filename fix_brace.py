import sys

with open('src/app/App.jsx', 'r') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if line.strip() == "} catch (err) {" and "isInvalidDb" in lines[i+1]:
        # we found line 1023
        lines.insert(i-1, "            }\n")
        break

with open('src/app/App.jsx', 'w') as f:
    f.writelines(lines)
print("Added missing brace!")
