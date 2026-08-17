router.get('/search', async (req, res) => {
  const { name } = req.query;
  const { rows } = await db.query(
    'SELECT * FROM products WHERE name ILIKE $1',
    [`%${name}%`]
  );
  res.json(rows);
});