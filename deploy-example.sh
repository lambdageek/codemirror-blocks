echo "building static resources"
npm run build
cp -R build/ build-copy
cp example/index.html build-copy/
echo "switching to gh-pages branch"
git checkout -B gh-pages origin/gh-pages
rm -rf build
mv build-copy/ build
mv build/index.html example.html
git add build/
git add example.html
echo "committing changes"
git commit -m "updating example page"
echo "pushing changes to github"
git push
echo "switching back to master"
git checkout master