"""Run after generate_polish_surfaces.py; tests source preservation and exact borders."""
import hashlib,json,unittest
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
class Surfaces(unittest.TestCase):
 def test_continuous_texture_borders(self):
  root=ROOT/'public/tiles/twilight/polished'
  for name in ['grass','dirt','water','stone']:
   im=Image.open(root/f'{name}.png').convert('RGBA')
   self.assertEqual(im.size,(64,64))
   self.assertEqual(im.getchannel('A').getextrema(),(255,255))
   for n in range(64):
    self.assertEqual(im.getpixel((0,n)),im.getpixel((63,n)))
    self.assertEqual(im.getpixel((n,0)),im.getpixel((n,63)))
 def test_original_files_preserved(self):
  baseline=json.loads((ROOT/'art/pixel-tiles-polish/original-hashes.json').read_text())
  for path,digest in baseline.items():
   self.assertEqual(hashlib.sha256((ROOT/path).read_bytes()).hexdigest(),digest,path)
  manifest=json.loads((ROOT/'public/tiles/twilight/props/manifest.json').read_text())
  self.assertEqual(len(manifest['assets']),54)
  for asset in manifest['assets']:
   im=Image.open(ROOT/'public/tiles/twilight/props'/asset['file']).convert('RGBA')
   self.assertEqual(list(im.size),asset['size'])
   self.assertEqual(im.getchannel('A').getextrema(),(0,255),asset['id'])
   self.assertTrue(0<=asset['anchor'][0]<im.width and 0<=asset['anchor'][1]<im.height)
if __name__=='__main__':unittest.main()
