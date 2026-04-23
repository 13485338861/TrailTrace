#!/usr/bin/env python3
"""Patch android/app/build.gradle to exclude kotlin-stdlib-jdk7/jdk8 (duplicate class fix)."""
import re
import os

gradle_path = os.path.join(os.path.dirname(__file__), '..', 'android', 'app', 'build.gradle')

with open(gradle_path, 'r') as f:
    content = f.read()

patch = """configurations.all {
    exclude group: 'org.jetbrains.kotlin', module: 'kotlin-stdlib-jdk7'
    exclude group: 'org.jetbrains.kotlin', module: 'kotlin-stdlib-jdk8'
}
"""

# Insert before the dependencies block
content = re.sub(
    r'(dependencies \{)',
    patch + r'\1',
    content
)

with open(gradle_path, 'w') as f:
    f.write(content)
