const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = 3000;

const connection = mysql.createConnection({
    host: 'dpg-cvrvqi8gjchc73a48m7g-a',
    user: 'timecheck_db_pymw_user',
    password: 'uap8K7xcKnBdSYZmLDpWRBTzSzQ6mmkH',
    database: 'timecheck_db_pymw'
});

app.use(bodyParser.json());
app.use(cors());

app.post('/login', (req, res) => {
    const { usuario, senha } = req.body;

    //verifica se os campos foram preenchidos
    if (!usuario || !senha) {
        return res.status(400).json({ sucess: false, mensage: 'Usuário e senha são obrigatórios' });
    }

    const query = 'SELECT * FROM funcionarios WHERE usuario = ? AND senha = SHA2(?, 256)';
    connection.query(query, [usuario, senha], (err, results) => {
        if (err) {
            return res.status(500).json({ sucess: false, mensage: 'Erro no servidor' });
        }

        if (results.length > 0) {
            res.json({
                sucess: true,
                mensage: 'Login bem-sucedido',
                id_funcionario: results[0].id,
                nome: results[0].nome
            });
        } else {
            res.status(401).json({ sucess: false, mensage: 'Usuário ou senha incorretos' });
        }
    });
});

app.use(cors({
    origin: '*', // Permite todas as origens
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  }));


app.post('/cadastro', (req, res) => {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {
        return res.status(400).json({ sucess: false, mensage: 'Todos os campos são obrigatórios.' });
    }

    // Gera usuário com primeiro e último nome
    const partesNome = nome.trim().split(' ');
    const usuario = (partesNome[0] + '.' + partesNome[partesNome.length - 1]).toLowerCase();

    // Verifica se o usuário ou email já existem
    const verificaQuery = 'SELECT * FROM funcionarios WHERE usuario = ? OR email = ?';
    connection.query(verificaQuery, [usuario, email], (err, results) => {
        if (err) {
            console.error('Erro SQL:', err);
            return res.status(500).json({ sucess: false, mensage: 'Erro ao verificar usuário', error: err.mensage });
        }
    
        if (results.length > 0) {
            return res.status(400).json({ sucess: false, mensage: 'Usuário ou e-mail já cadastrado' });
        }
    
        // Insere o novo funcionário
        const insertQuery = 'INSERT INTO funcionarios (nome, usuario, senha, email) VALUES (?, ?, SHA2(?, 256), ?)';
        connection.query(insertQuery, [nome, usuario, senha, email], (err, results) => {
            if (err) {
                return res.status(500).json({ sucess: false, mensage: 'Erro ao cadastrar usuário' });
            }
    
            res.json({ sucess: true, mensage: 'Cadastro realizado com sucesso' });
        });
    });
});

  

//registrar ponto
app.post('/registrar-ponto', (req, res) => {
    const { id_funcionario, tipo_registro, local } = req.body;
    
    console.log('Recebido registro:', { id_funcionario, tipo_registro, local });

    const query = `INSERT INTO registros_ponto 
                   (id_funcionario, horario, data, local, tipo_registro) 
                   VALUES (?, CURTIME(), CURDATE(), ?, ?)`;
    
    connection.query(query, [id_funcionario, local || null, tipo_registro], (err, results) => {
        if (err) {
            console.error('Erro no registro:', err);
            return res.status(500).json({ sucess: false, mensage: 'Erro ao registrar ponto'});
        }
        
        console.log('Registro inserido com ID:', results.insertId);
        res.json({
            sucess: true,
            mensage: 'Ponto registrado com sucesso',
            registro_id: results.insertId
        });
    });
});

//rota para obter registros de pontos do funcionario
app.get('/registros/:id_funcionario', (req, res) => {
    const {id_funcionario} = req.params;
    
    console.log(`Buscando registros para funcionário ${id_funcionario}`);

    const query = `SELECT 
                    id,
                    id_funcionario,
                    TIME_FORMAT(horario, '%H:%i:%s') as horario,
                    DATE_FORMAT(data, '%Y-%m-%d') as data,
                    local,
                    tipo_registro
                  FROM registros_ponto 
                  WHERE id_funcionario = ? 
                  ORDER BY data DESC, horario DESC`;

    connection.query(query, [id_funcionario], (err, results) => {
        if (err) {
            console.error('Erro na query:', err);
            return res.status(500).json({ 
                sucess: false, 
                mensage: 'Erro ao buscar registros',
                error: err.mensage
            });
        }

        console.log(`Total de registros encontrados: ${results.length}`);
        if (results.length > 0) {
            console.log('Registro mais recente:', results[0]);
            console.log('Registro mais antigo:', results[results.length-1]);
        }

        res.json({
            sucess: true,
            registros: results
        });
    });
});

//rota para atualizar o horário de um registro
app.put('/atualizar-registro/:id', (req, res) => {
    const { id } = req.params;
    const { novo_horario } = req.body;

    //verifica quantas alterações já foram feitas
    connection.query(
        'SELECT alteracoes FROM registros_ponto WHERE id = ?',
        [id],
        (err, results) => {
            if (err) {
                console.error('Erro ao verificar alterações:', err);
                return res.status(500).json({ 
                    sucess: false, 
                    mensage: 'Erro interno ao verificar registro'
                });
            }

            if (results.length === 0) {
                return res.status(404).json({ 
                    sucess: false, 
                    mensage: 'Registro não encontrado'
                });
            }

            const alteracoes = results[0].alteracoes || 0;
            
            if (alteracoes >= 2) {
                return res.status(400).json({ 
                    sucess: false, 
                    mensage: 'Limite de alterações atingido. Cada registro só pode ser alterado no máximo 2 vezes.'
                });
            }

            const updateQuery = `UPDATE registros_ponto 
                               SET horario = ?,
                                   alteracoes = ?,
                                   data_ultima_alteracao = NOW()
                               WHERE id = ?`;
             console.log(`Recebida requisição para atualizar registro ${id} para horário ${novo_horario}`);

    // 1. Verifique se o ID é válido
            if (!id || isNaN(id)) {
                return res.status(400).json({ 
                    sucess: false, 
                    mensage: 'ID do registro inválido'
                });
            }

            // 2. Verifique o formato do horário
            if (!novo_horario || !/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.test(novo_horario)) {
                return res.status(400).json({ 
                    sucess: false, 
                    mensage: 'Formato de horário inválido. Use HH:MM:SS'
                });
            }

            connection.query(
                updateQuery,
                [novo_horario, alteracoes + 1, id],
                (updateErr, updateResults) => {
                    if (updateErr) {
                        return res.status(500).json({ 
                            sucess: false, 
                            mensage: 'Erro interno ao atualizar registro'
                        });
                    }
                    
                    res.json({
                        sucess: true,
                        mensage: 'Horário atualizado com sucesso',
                        alteracoes_restantes: 2 - (alteracoes + 1)
                    });
                }
            );
        }
    );
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});