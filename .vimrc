" -----------------------------------------
" PLUGINS
" -----------------------------------------
call plug#begin('~/.vim/plugged')

Plug 'mcchrish/nnn.vim' " File explorer
Plug 'itchyny/lightline.vim' " Status Bar
Plug 'junegunn/fzf', { 'do': './install --bin' }
Plug 'junegunn/fzf.vim'
Plug 'tomtom/tcomment_vim'
Plug 'godlygeek/tabular'
Plug 'avakhov/vim-yaml'
Plug 'Vimjas/vim-python-pep8-indent'
Plug 'wesQ3/vim-windowswap' " Swap panes with <leader <<> <leader <<>
Plug 'gorkunov/smartpairs'
call plug#end()


" -----------------------------------------
" GENERAL
" -----------------------------------------
" Set leader key as ,
let mapleader=","

" Set syntax colors
syntax on
set encoding=UTF-8

" Indent
set autoindent
set smartindent
set expandtab
set shiftwidth=4
set softtabstop=4
set laststatus=2

" Infos
set nonumber           " disable line numbers
set wildmenu           " visual autocomplete for command menu
set timeout            " for mappings
set timeoutlen=1000    " default value
set ttimeout           " for key codes
set ttimeoutlen=0      " unnoticeable small value

" set ignorecase
set smartcase
set backspace=2

" FZF
" Liste files using fzf
nnoremap <C-f> :Files<CR>
let FZF_DEFAULT_COMMAND='fd -H -t f -E venv -E target -E .git'
" Liste les buffers vim
nnoremap <C-b> :Buffers<CR>
" Use ag to Fuzzy find in files
nnoremap <silent> <C-g> :Ag<CR>

" Snippets (when help is displayed)
let g:UltiSnipsExpandTrigger = "<c-j>"
let g:UltiSnipsJumpForwardTrigger="<c-x>"
let g:UltiSnipsJumpBackwardTrigger="<c-c>"

" Helper for displaying whitespaces
set list listchars=tab:»·,trail:·

" Set settings for file types
filetype plugin on
filetype plugin indent on
autocmd BufNewFile,BufRead *.md set filetype=markdown
autocmd BufNewFile,BufRead Vagrantfile set filetype=ruby
autocmd FileType ruby setlocal ts=2 sts=2 sw=2 expandtab
autocmd FileType yaml setlocal ts=2 sts=2 sw=2 expandtab

" TODO Map qq to exit buffer from Documentation popup

" Navigate between splits using Ctrl Key
map <C-j> <C-W>j
map <C-k> <C-W>k
map <C-h> <C-W>h
map <C-l> <C-W>l

" More natural splits opening
set splitbelow
set splitright

" Source : https://medium.com/@vinodkri/zooming-vim-window-splits-like-a-pro-d7a9317d40
" Neat trick to zoom-in and zoom-out the splits
" The command’s wont close any buffers like CTRL-W + o would.
" :help window-resize
" CTRL-W + | Set current window width to N (default: widest possible).
" CTRL-W + _ Set current window height to N (default: highest possible).
" CTRL-W + = Make all windows (almost) equally high and wide.
noremap Zz <c-w>_ \| <c-w>\|
noremap Zo <c-w>=

" Navigate between Tabs
nnoremap tn  :tabnew<CR>
nnoremap th  :tabfirst<CR>
nnoremap tk  :tabnext<CR>
nnoremap tj  :tabprev<CR>
nnoremap tl  :tablast<CR>

" nnn : open nnn window in a split
let g:nnn#layout = { 'left': '~20%' } " or right, up, down
" nnn : open files (with Enter key) in different layouts
let g:nnn#action = {
      \ '<c-t>': 'tab split',
      \ '<c-u>': 'split',
      \ '<c-i>': 'vsplit' }


" -----------------------------------------
" STYLE
" -----------------------------------------
" Change auto-complete color
highlight Pmenu ctermbg=gray guibg=gray
" Color scheme
colorscheme monokai
" Status bas colorscheme
let g:lightline = { 'colorscheme': 'wombat'}


" -----------------------------------------
" ABR
" -----------------------------------------
ab abash #!/bin/bash<CR>#Date:strftime("%c")<CR>#Description:


" -----------------------------------------
" USERFUL KEYBINDINGS
" -----------------------------------------
" CTRL-C : Quit insert mode, go back to Normal mode. Do not check for abbreviations. Does not trigger the InsertLeave autocommand event.
" VISUAL MODE : I majuscule pour insérer sur plusieurs colonnes
" tabnew | term
