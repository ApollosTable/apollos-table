const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

describe('images', () => {
  const { imagePath, ensureImagesDir } = require('../../scanner/images');

  it('generates correct image path from listing ID and index', () => {
    const p = imagePath(12345, 0);
    expect(p).to.match(/images[/\\]12345_0\.jpg$/);
  });

  it('ensures images directory exists', () => {
    const dir = ensureImagesDir();
    expect(fs.existsSync(dir)).to.be.true;
  });
});
