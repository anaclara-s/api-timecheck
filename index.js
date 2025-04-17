const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Conexão com PostgreSQL do Render
const pool = new Pool({
    host: 'dpg-cvrvqi8gjchc73a48m7g-a',
    user: 'timecheck_db_pymw_user',
    password: 'uap8K7xcKnBdSYZmLDpWRBTzSzQ6mmkH',
    database: 'timecheck_db_pymw',
    port: 5432,
    ssl: { rejectUnauthorized: false }
});

app.use(bodyParser.json());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// LOGIN
app.post('/login', async (req, res) => {
    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
        return res.status(400).json({ sucess: false, mensage: 'Usuário e senha são obrigatórios' });
    }

    const query = `SELECT * FROM funcionarios WHERE usuario = $1`;

    try {
        const result = await pool.query(query, [usuario]);

        if (result.rows.length === 0) {
            return res.status(401).json({ sucess: false, mensage: 'Usuário ou senha incorretos' });
        }

        const user = result.rows[0];
        const senhaConfere = await bcrypt.compare(senha, user.senha);

        if (!senhaConfere) {
            return res.status(401).json({ sucess: false, mensage: 'Usuário ou senha incorretos' });
        }

        res.json({
            sucess: true,
            mensage: 'Login bem-sucedido',
            id_funcionario: user.id,
            nome: user.nome
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ sucess: false, mensage: 'Erro no servidor' });
    }
});

// CADASTRO
const bcrypt = require('bcrypt');

app.post('/cadastro', async (req, res) => {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {
        return res.status(400).json({ sucess: false, mensage: 'Todos os campos são obrigatórios.' });
    }

    const partesNome = nome.trim().split(' ');
    const usuario = (partesNome[0] + '.' + partesNome[partesNome.length - 1]).toLowerCase();

    const verificaQuery = `SELECT * FROM funcionarios WHERE usuario = $1 OR email = $2`;

    try {
        const result = await pool.query(verificaQuery, [usuario, email]);

        if (result.rows.length > 0) {
            return res.status(400).json({ sucess: false, mensage: 'Usuário ou e-mail já cadastrado' });
        }

        const saltRounds = 10;
        const senhaCriptografada = await bcrypt.hash(senha, saltRounds);

        const insertQuery = `
            INSERT INTO funcionarios (nome, usuario, senha, email) 
            VALUES ($1, $2, $3, $4)
        `;
        await pool.query(insertQuery, [nome, usuario, senhaCriptografada, email]);

        res.json({ sucess: true, mensage: 'Cadastro realizado com sucesso' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ sucess: false, mensage: 'Erro ao cadastrar usuário' });
    }
});

// REGISTRAR PONTO

const moment = require('moment-timezone');
process.env.TZ = 'America/Sao_Paulo';

app.post('/registrar-ponto', async (req, res) => {
    const { id_funcionario, tipo_registro, local } = req.body;

    const query = `
        INSERT INTO registros_ponto 
        (id_funcionario, horario, data, local, tipo_registro) 
        VALUES ($1, CURRENT_TIME, CURRENT_DATE, $2, $3)
        RETURNING id
    `;

    try {
        const result = await pool.query(query, [id_funcionario, local || null, tipo_registro]);
        res.json({
            sucess: true,
            mensage: 'Ponto registrado com sucesso',
            registro_id: result.rows[0].id
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ sucess: false, mensage: 'Erro ao registrar ponto' });
    }
});

// OBTER REGISTROS DE PONTO
app.get('/registros/:id_funcionario', async (req, res) => {
    const { id_funcionario } = req.params;

    const query = `
        SELECT 
            id,
            id_funcionario,
            TO_CHAR(horario, 'HH24:MI:SS') as horario,
            TO_CHAR(data, 'YYYY-MM-DD') as data,
            local,
            tipo_registro
        FROM registros_ponto 
        WHERE id_funcionario = $1 
        ORDER BY data DESC, horario DESC
    `;

    try {
        const result = await pool.query(query, [id_funcionario]);
        res.json({
            sucess: true,
            registros: result.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ sucess: false, mensage: 'Erro ao buscar registros' });
    }
});

// ATUALIZAR REGISTRO DE PONTO
app.put('/atualizar-registro/:id', async (req, res) => {
    const { id } = req.params;
    const { novo_horario } = req.body;

    if (!id || isNaN(id)) {
        return res.status(400).json({ sucess: false, mensage: 'ID do registro inválido' });
    }

    if (!/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.test(novo_horario)) {
        return res.status(400).json({ sucess: false, mensage: 'Formato de horário inválido. Use HH:MM:SS' });
    }

    try {
        const checkResult = await pool.query(
            `SELECT alteracoes FROM registros_ponto WHERE id = $1`,
            [id]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ sucess: false, mensage: 'Registro não encontrado' });
        }

        const alteracoes = checkResult.rows[0].alteracoes || 0;

        if (alteracoes >= 2) {
            return res.status(400).json({
                sucess: false,
                mensage: 'Limite de alterações atingido. Cada registro só pode ser alterado no máximo 2 vezes.'
            });
        }

        await pool.query(
            `UPDATE registros_ponto 
             SET horario = $1, alteracoes = $2, data_ultima_alteracao = NOW()
             WHERE id = $3`,
            [novo_horario, alteracoes + 1, id]
        );

        res.json({
            sucess: true,
            mensage: 'Horário atualizado com sucesso',
            alteracoes_restantes: 2 - (alteracoes + 1)
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ sucess: false, mensage: 'Erro interno ao atualizar registro' });
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
