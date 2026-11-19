# Dart-tip model attribution

`dart-tip.onnx` is an ONNX conversion of **Bayernator / ScoreLens dd6**, published
at https://huggingface.co/Bayernator/scorelens-dd6 under **CC BY-NC 4.0**.
The exact source revision, original checkpoint hash, converted model hash,
class order and conversion versions are in `dart-tip.json`.

Conversion changes: fixed 800×800 float32 ONNX, opset 17, no embedded NMS,
normalized metadata. No additional training or claimed accuracy improvement.
Source checkpoint: `best.pt` at the pinned revision. Attribution must travel
with copies. This model is restricted to noncommercial use; the weight license
does not relicense the application's other code. Full terms: `MODEL-LICENSE.txt`
and https://creativecommons.org/licenses/by-nc/4.0/ .

Underlying approach: William McNally, Kanav Vats, Alexander Wong and John McPhee,
*DeepDarts: Modeling Keypoints as Objects for Automatic Scorekeeping in Darts
Using a Single Camera* (2021), https://arxiv.org/abs/2105.09880 .
The publisher states the dd6 training data derives from DeepDarts. We have not
independently audited the training set or reproduced training.

Inference uses ONNX Runtime Web 1.23.2 (Microsoft, MIT); license alongside this
file. `scripts/prepare-tip-runtime.mjs` copies the pinned npm runtime into the
published site. No model or camera request goes to an external inference API.

See `docs/dart-tip-validation.md` in the source repository for known failures.
