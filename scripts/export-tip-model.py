"""Optional offline conversion; normal builds use the checked-in, hashed ONNX.
Python 3.11: torch==2.6.0+cpu, torchvision==0.21.0+cpu (PyTorch CPU index),
ultralytics==8.3.203, onnx==1.17.0. Run from the repository root.
Ultralytics conversion tooling has its own AGPL-3.0/commercial license.
"""
import hashlib
import json
import pathlib
import tempfile
import urllib.request
import onnx
from ultralytics import YOLO

root = pathlib.Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'dist/models/dart-tip.json').read_text())
with tempfile.TemporaryDirectory() as directory:
    checkpoint = pathlib.Path(directory) / 'best.pt'
    url = manifest['source'] + '/resolve/' + manifest['revision'] + '/best.pt'
    checkpoint.write_bytes(urllib.request.urlopen(url, timeout=120).read())
    assert hashlib.sha256(checkpoint.read_bytes()).hexdigest() == manifest['checkpointSha256'], 'Checkpoint hash mismatch'
    exported = YOLO(str(checkpoint)).export(format='onnx', imgsz=800, opset=17,
        simplify=False, dynamic=False, half=False, device='cpu')
    model = onnx.load(exported)
    del model.metadata_props[:]
    metadata = {
        'source': manifest['source'] + '/tree/' + manifest['revision'],
        'license': manifest['license'],
        'classes': json.dumps(manifest['classes']),
        'input': 'RGB/255 NCHW 1x3x800x800',
        'tip_class': '4',
    }
    for key, value in sorted(metadata.items()):
        item = model.metadata_props.add(); item.key = key; item.value = value
    output = root / 'dist/models/dart-tip.onnx'
    onnx.save(model, str(output))
    print('Converted SHA256:', hashlib.sha256(output.read_bytes()).hexdigest())
    print('Review metadata/version differences before changing the manifest hash.')
